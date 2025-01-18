if(process.env.NODE_ENV != "production") {
    require('dotenv').config();
}
const axios = require('axios')
const express = require('express')
const app = express()
const port = 3000
const ejs = require('ejs')
const ejsMate = require('ejs-mate')
const path = require('path')
const session = require("express-session")
const MongoStore = require('connect-mongo')
const passport = require('passport')
const passportLocal = require('passport-local')
const flash = require('connect-flash')
const ExpressError = require('./utils/ExpressError')
const wrapAsync = require('./utils/wrapAsync')
const User = require('./models/users')
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const dbUrl = process.env.ATLASDB_URL;
const store = MongoStore.create({
    mongoUrl : dbUrl,
    crypto : {
        secret : process.env.SECRET
    },
    touchAfter : 24 * 3600
})

store.on('error', () => {
    console.log('Some error occured in mongoStore', err)
})
const sessionOptions = ({
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true, 
    cookie : {
      expires : Date.now() + 7 * 24 * 60 * 60 * 1000,
      maxAge : 7 * 24 * 60 * 60 * 1000, 
      httpOnly : true,
    },
})


  
app.use(session(sessionOptions)); 
app.use(flash());
app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.engine('ejs', ejsMate);
app.use(express.static(path.join(__dirname, "/public")));


app.use(passport.initialize());
app.use(passport.session());
passport.use(new passportLocal(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

const validateEmailWithHunter = async (email) => {
    const apiUrl = `https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${HUNTER_API_KEY}`;
    try {
        const response = await axios.get(apiUrl);
        return response.data; // Return the response data
    } catch (error) {
        console.error('Error during Hunter validation:', error.message);
        throw new Error('Error validating email with Hunter.io.');
    }
};

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    next();
})
//Home Route
app.get('/', (req, res) => {
  res.render('page/index')
})

//LoginPage Route
app.get('/signup', (req, res) => {
    res.render("users/signup")
})

app.post('/signup', wrapAsync(async(req, res, next) => {
    try{
        const { email, username, password } = req.body

        const emailValidation = await validateEmailWithHunter(email)
        if (emailValidation.data.result !== 'deliverable') {
            req.flash('error', `Invalid email: ${emailValidation.data.sub_status || emailValidation.data.status}`);
            return res.redirect('/signup');
        }
        
        const newUser = new User({email, username})
        const registeredUser = await User.register(newUser, password)
        req.login(registeredUser, (err) => {
            if(err) {
                return next(err)
            }
            req.flash('success', 'successfully registered')
            return res.redirect('/')
        })
    
        
    } catch(err) {

        req.flash('error', err.message)
        res.redirect('/signup')
    }
})
)


app.get('/login' ,(req, res) => {
    res.render('users/login')
})

app.post('/login', passport.authenticate('local', {
    failureFlash: true,
    failureRedirect: '/login'
}),(req, res) => {
    req.flash('success', 'Logged in');
    res.redirect('/');
});



app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return next(err);
        req.flash("success", "You are logged out");
        res.redirect("/"); 
    });
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})

const mongoose = require('mongoose');


main().then(() => {
    console.log("Connection established")
})
.catch(err => console.log(err));

async function main() {
  await mongoose.connect(dbUrl);

}



app.all('*', (req, res, next) => {
    next(new ExpressError(404, 'Page not found'))
})

app.use((err, req, res, next) => {
    let { status = 500, message = "Something Went Wrong!" } = err;
    res.status(status).render("page/error", { message });
});