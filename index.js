import pg from "pg";
import bodyParser from "body-parser";
import express from "express";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2"
import env from "dotenv";


const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

let users = [];
let user_emails = [];
let cur_user;
let user_id;
let error;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);
app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
    host: process.env.DB_HOST,
    ssl: true,
    connectionTimeoutMillis: 10000,  // Increase the timeout
    // ssl:{
    //     rejectUnauthorized: false
    // }
});
  
  db.connect()
  .then(() => console.log('Connected to the database'))
  .catch((err) => {
    console.error('Connection error:', err.message);
    console.error('Stack trace:', err.stack);
    console.error('Error type ... : ', err.name);
  });

//   db.query("create table users( id serial primary key, email varchar(50), password varchar(100), fname varchar(50), lname varchar(50), username varchar(50))", (err, res) => {
//     if(err){
//         console.log("ERROR CREATING TABLE USERS", err.message);
//     }else{
//         console.log("USERS TABLE CREATED SUCCESSFULLY!");
//     }
//   });

//   db.query("create table todo( id serial primary key, user_id int, task text, due date, foreign key (user_id) references users(id))", (err, res) => {
//     if(err){
//         console.log("ERROR CREATING TABLE TOOD", err.message);
//     }else{
//         console.log("TODO TABLE CREATED SUCCESSFULLY!");
//     }
//   });

//   db.query("select * from users", (err, res) => {
//     if(err){
//         console.log("ERROR GETTING DATA FROM users", err.stack);
//     }else{
//         users = res.rows;
//     }
//   });

//   db.query("select email from users", (err, res) => {
//     if(err){
//         console.log("ERROR GETTING EMAIL DATA FROM users", err.stack);
//     }else{
//         user_emails = res.rows;
//     }
//   });

app.get("/", (req, res) =>{
    if(error){
        res.render("index.ejs", {error: true});
    }else{
        res.render("index.ejs");
    }
    
});

app.get("/register", (req, res) => {
    res.render("register.ejs");
}); 

app.get("/list", async (req, res) => {
    if(req.isAuthenticated()){
        let r = [];
        db.query("select * from todo where user_id = $1", [cur_user] , (err, result) => { // Going to have to change to whatever user id is logged in
            if (err) {
                console.log("ERROR", err.stack);
                res.status(500).send("Database query failed I THINK HERE");
            } else {
                if (result.rows.length > 0) {
                    r = result.rows;
                    // console.log("CUR USER: " + cur_user);
                    res.render("list.ejs", { todo : r , cur_user: cur_user });
                } else {
                    // NO TASKS FOR THIS USER YET
                    // console.log("CUR USER: " + cur_user);
                    res.render("list.ejs", { todo : r, cur_user: cur_user});
                }
            }
        });
    }else{
        console.log("NOT AUTHENTICATED YET, REDIRECTED TO LOGIN");
        res.redirect("/");
    }
});

app.get("/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"]
}));

app.get("/auth/google/list", passport.authenticate("google", {
    successRedirect: "/list",
    failureRedirect: "/"
}))

app.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err){
            console.log(err);
        }else{
            res.redirect("/");
        }
    })
});

app.post("/register", async (req, res) => {
    const register_email = req.body["email"];
    const register_password = req.body["password"];
    const register_username = req.body["username"];
    const register_fname = req.body["fname"];
    const register_lname = req.body["lname"];

    try{
        const checkEmail = await db.query("select * from users where email = $1", [register_email]);
        if(checkEmail.rows.length > 0){
            // SEND AN ERROR TO THE SCREEN THAT SAYS EMAIL ALREADY EXISTS
            res.render("register.ejs", {err: true});
        }else{
            // Password hashing
            bcrypt.hash(register_password, saltRounds, async (err, hash) => {
                if(err){
                    console.log(err);
                }else{
                    const results = await db.query("insert into users (email, password, fname, lname, username) values ($1, $2, $3, $4, $5) RETURNING *", [register_email, hash, register_fname, register_lname, register_username]);
                    const user = results.rows[0];
        
                    db.query("select email from users", (err, res) => {
                        if(err){
                            console.log("ERROR", err.stack);
                        }else{
                            user_emails = res.rows;
                        }
                    });
                
                    db.query("select * from users", (err, res) => {
                        if(err){
                            console.log("ERROR", err.stack);
                        }else{
                            users = res.rows;
                        }
                    });

                    db.query(`select id from users where email = $1`, [register_email], (err, result) => { 
                        if (err) {
                            console.log("ERROR", err.stack);
                        } else {
                            user_id = result.rows;
                            cur_user = user_id[0].id;
                        }
                    });

                    req.login(user, (err) => {
                        console.log(err);
                        res.redirect("/list");
                    })
                }
            });  
        }
    } catch (err) {
        console.log(err);
    }
});

app.post("/", passport.authenticate("local", {
    successRedirect: "/list",
    failureRedirect: "/"
}));

app.post("/delete", async (req, res) => {
    const task = req.body["checked-task"];
    console.log(task);

    db.query('delete from todo where task = $1', [task], (err, result) => { 
        if (err) {
            console.log("ERROR", err.stack);
            res.status(500).send("Database query failed");
        } else {
            console.log("DELETED FROM DATABASE");
        }
    });

    res.redirect("/list");
});

app.post("/add", (req, res) => {
    const newTask = req.body["new-task-desc"];
    const newTaskMonth = req.body["new-task-month"];
    const current_account = req.body["current_account"];
    console.log(newTaskMonth);
    let db_month, db_day, db_year;

    if(newTaskMonth == "1" || newTaskMonth == "01" || newTaskMonth == "jan" || newTaskMonth == "january" || newTaskMonth == "Jan" || newTaskMonth == "January"){
        db_month = "01";
     } else if(newTaskMonth == "2" || newTaskMonth == "02" || newTaskMonth == "feb" || newTaskMonth == "february" || newTaskMonth == "Feb" || newTaskMonth == "February"){ 
        db_month = "02";
     } else if(newTaskMonth == "3" || newTaskMonth == "03" || newTaskMonth == "mar" || newTaskMonth == "march" || newTaskMonth == "Mar" || newTaskMonth == "March"){ 
        db_month = "03";
     }  else if(newTaskMonth == "4" || newTaskMonth == "04" || newTaskMonth == "apr" || newTaskMonth == "april" || newTaskMonth == "Apr" || newTaskMonth == "April"){ 
        db_month = "04";
     } else if(newTaskMonth == "5" || newTaskMonth == "05" || newTaskMonth == "may" || newTaskMonth == "May"){ 
        db_month = "05";
     } else if(newTaskMonth == "6" || newTaskMonth == "06" || newTaskMonth == "jun" || newTaskMonth == "june" || newTaskMonth == "Jun" || newTaskMonth == "June"){ 
        db_month = "06";
     } else if(newTaskMonth == "7" || newTaskMonth == "07" || newTaskMonth == "jul" || newTaskMonth == "july" || newTaskMonth == "Jul" || newTaskMonth == "July"){ 
        db_month = "07";
     } else if(newTaskMonth == "8" || newTaskMonth == "08" || newTaskMonth == "aug" || newTaskMonth == "august" || newTaskMonth == "Aug" || newTaskMonth == "August"){ 
        db_month = "08";
     } else if(newTaskMonth == "9" || newTaskMonth == "09" || newTaskMonth == "sep" || newTaskMonth == "september" || newTaskMonth == "Sep" || newTaskMonth == "September"){ 
        db_month = "09";
     } else if(newTaskMonth == "10" || newTaskMonth == "oct" || newTaskMonth == "october" || newTaskMonth == "Oct" || newTaskMonth == "October"){ 
        db_month = "10";
     } else if(newTaskMonth == "11" || newTaskMonth == "nov" || newTaskMonth == "november" || newTaskMonth == "Nov" || newTaskMonth == "November"){ 
        db_month = "11";
     } else if(newTaskMonth == "12" || newTaskMonth == "dec" || newTaskMonth == "december" || newTaskMonth == "Dec" || newTaskMonth == "December"){ 
        db_month = "12";
     } 

    const newTaskDay = req.body["new-task-day"];
    const newTaskYear = req.body["new-task-year"];
    
    console.log("CURRENT ACCOUNT NEXT: " + current_account + " " + newTask + " " + newTaskYear + " " + db_month + " " + newTaskDay); 

    try{
        db.query(`insert into todo (user_id, task, due) values ($1, $2, $3);`, [`${current_account}`, newTask, `${newTaskYear}-${db_month}-${newTaskDay}`], (err, result) => { 
            if (err) {
                console.log("ERROR HERE THO... ", err.stack);
            } else {
                console.log(`ADDED TO DATABASE: ${newTask}`);
            }
        });
    }catch(err){
        console.log("ERROR HERE: ", err.stack);
    }finally{
        res.redirect("/list");
    }
    
});

passport.use("local", new Strategy({usernameField: 'email', passwordField: 'password'}, async function verify(email, password, cb) {
    try{
        const checkEmail = await db.query(`select * from users where email = $1`, [email]);
        user_id = checkEmail.rows;
        cur_user = user_id[0].id;
        
        if(checkEmail.rows.length > 0){
            const user = checkEmail.rows[0];
            const stored_password = user.password;

            bcrypt.compare(password, stored_password, (err, result) => {
                if(err){
                    cb(err);
                }else{
                    console.log(result);
                    console.log("Check error here.");
                    if(result){
                        error = false;
                        return cb(null, user);
                    }else{
                        error = true;
                        return cb(null, false)
                    }
                }
            });
        }else{
            return cb("User not found");
        }
    }catch(err){
        return cb(err);
    }
}));

passport.use("google", new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/list",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
}, async (accessToken, refreshToken, profile, cb) => {
    // console.log(profile);
    try{
        const result = await db.query("select * from users where email = $1", [profile.email])
        if(result.rows.length === 0){
            // USING THE GOOGLE SIGN IN, NO USER WITH THAT EMAIL IN OUR DATABASE, CREATE A NEW ACCOUNT AND REDIRECT TO LOGIN
            const newUser = await db.query("insert into users (email, password, fname, l name, username) values ($1, $2, $3, $4, $5)", [profile.email, "google", "N/A", "N/A", profile.email]);
            cb(null, newUser.rows[0]);
        }else{
            // ACCOUNT EXISTS, LOGGING THEM IN USING GOOGLE 
            const results = await db.query("select id from users where email = $1", [profile.email]);
            cur_user = results.rows[0].id;
            cb(null, result.rows[0]);
        }
    }catch(err){
        cb(err);
    }
}))

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(port, (req, res) => {
    console.log(`Server now running on port ${port}`);
});

db.end();