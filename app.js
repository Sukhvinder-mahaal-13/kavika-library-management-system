
// ========================================
// LOAD ENVIRONMENT VARIABLES
// ========================================

require("dotenv").config();


// ========================================
// IMPORTS
// ========================================

const express = require("express");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const session = require("express-session");
const MongoStore = require("connect-mongo");


// ========================================
// ROUTES
// ========================================

const userRoutes = require("./routes/user");
const seatRoutes = require("./routes/seat");
const bookingRoutes = require("./routes/booking");
const adminRoutes = require("./routes/admin");
const galleryRoutes = require("./routes/gallery");

const contactRoutes = require("./routes/contactRoutes");
const locationRoutes = require("./routes/locationRoutes");
const notesRoutes = require("./routes/notesRoutes");


// ========================================
// MODELS
// ========================================

const Seat = require("./models/Seat");
const HomeImage = require("./models/HomeImage");
const Pricing = require("./models/Pricing");


// ========================================
// APP
// ========================================

const app = express();


// ========================================
// PRODUCTION CHECK
// ========================================

if (process.env.NODE_ENV === "production") {

    app.set("trust proxy", 1);

}


// ========================================
// ENVIRONMENT VALIDATION
// ========================================

if (!process.env.MONGO_URI) {

    console.error(
        "ERROR: MONGO_URI is missing from environment variables."
    );

    process.exit(1);

}


if (!process.env.SESSION_SECRET) {

    console.error(
        "ERROR: SESSION_SECRET is missing from environment variables."
    );

    process.exit(1);

}


// ========================================
// BODY PARSING
// ========================================

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(
    express.json()
);


// ========================================
// METHOD OVERRIDE
// ========================================

app.use(
    methodOverride("_method")
);


// ========================================
// STATIC FILES
// ========================================

app.use(
    express.static("public")
);


// ========================================
// SESSION
// ========================================

app.use(
    session({

        secret: process.env.SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        store: MongoStore.create({

            mongoUrl: process.env.MONGO_URI,

            ttl: 1000 * 60 * 60 * 24

        }),

        cookie: {

            maxAge: 1000 * 60 * 60 * 24,

            httpOnly: true,

            secure:
                process.env.NODE_ENV === "production",

            sameSite: "lax"

        }

    })
);


// ========================================
// VIEW ENGINE
// ========================================

app.set(
    "view engine",
    "ejs"
);


// ========================================
// GLOBAL USER DATA
// ========================================

app.use(
    (req, res, next) => {

        res.locals.userName =
            req.session.userName || null;

        res.locals.userId =
            req.session.userId || null;

        res.locals.userRole =
            req.session.userRole || null;

        next();

    }
);


// ========================================
// ROUTES
// ========================================


// ----------------------------------------
// CONTACT
// ----------------------------------------

app.use(
    "/contact",
    contactRoutes
);


// ----------------------------------------
// NOTES
// ----------------------------------------

app.use(
    "/notes",
    notesRoutes
);


// ----------------------------------------
// LOCATION
// ----------------------------------------

app.use(
    "/location",
    locationRoutes
);


// ----------------------------------------
// USERS
// ----------------------------------------

app.use(
    "/users",
    userRoutes
);


// ----------------------------------------
// SEATS
// ----------------------------------------

app.use(
    "/seats",
    seatRoutes
);


// ----------------------------------------
// BOOKINGS
// ----------------------------------------

app.use(
    "/bookings",
    bookingRoutes
);


// ----------------------------------------
// ADMIN
// ----------------------------------------

app.use(
    "/admin",
    adminRoutes
);


// ----------------------------------------
// GALLERY
// ----------------------------------------

app.use(
    "/gallery",
    galleryRoutes
);


// ========================================
// HOME PAGE
// GET /
// ========================================

app.get(
    "/",
    async (req, res) => {

        try {

            // ========================================
            // GET HOME IMAGES + PRICING
            // ========================================

            const [
                homeImages,
                pricingData
            ] = await Promise.all([

                HomeImage.find()
                    .lean(),

                Pricing.find()
                    .lean()

            ]);


            // ========================================
            // FIND HERO IMAGE
            // ========================================

            const heroImage =
                homeImages.find(
                    image =>
                        image.type === "hero"
                );


            // ========================================
            // FIND ABOUT IMAGE
            // ========================================

            const aboutImage =
                homeImages.find(
                    image =>
                        image.type === "about"
                );


            // ========================================
            // DEFAULT PRICES
            // ========================================

            const pricing = {

                day: 500,

                night: 300,

                full: 650

            };


            // ========================================
            // DATABASE PRICES
            // ========================================

            pricingData.forEach(
                item => {

                    if (
                        item.type === "day"
                    ) {

                        pricing.day =
                            Number(item.price);

                    }


                    if (
                        item.type === "night"
                    ) {

                        pricing.night =
                            Number(item.price);

                    }


                    // IMPORTANT:
                    // Pricing model uses "fullDay"
                    // Homepage object uses "full"

                    if (
                        item.type === "fullDay"
                    ) {

                        pricing.full =
                            Number(item.price);

                    }

                }
            );


            // ========================================
            // RENDER HOME
            // ========================================

            return res.render(
                "home",
                {

                    heroImage:
                        heroImage
                            ? heroImage.image
                            : "/images/kavika.jpeg",

                    aboutImage:
                        aboutImage
                            ? aboutImage.image
                            : "/images/kavika-2.jpeg",

                    pricing,

                    userName:
                        req.session.userName || null

                }
            );

        } catch (err) {

            console.error(
                "Home page error:",
                err
            );


            // ========================================
            // FALLBACK HOME
            // ========================================

            return res.render(
                "home",
                {

                    heroImage:
                        "/images/kavika.jpeg",

                    aboutImage:
                        "/images/kavika-2.jpeg",

                    pricing: {

                        day: 500,

                        night: 300,

                        full: 650

                    },

                    userName:
                        req.session.userName || null

                }
            );

        }

    }
);


// ========================================
// CREATE 55 SEATS
// ADMIN ONLY
// GET /create-seats
// ========================================

app.get(
    "/create-seats",
    async (req, res) => {

        try {

            // ========================================
            // ADMIN SECURITY
            // ========================================

            if (
                !req.session ||
                !req.session.userId ||
                req.session.userRole !== "admin"
            ) {

                return res
                    .status(403)
                    .send(
                        "Access denied. Admin only."
                    );

            }


            // ========================================
            // FIND EXISTING SEATS
            // ========================================

            const existingSeats =
                await Seat.find()
                    .select("seatNumber")
                    .lean();


            const existingNumbers =
                new Set(
                    existingSeats.map(
                        seat =>
                            seat.seatNumber
                    )
                );


            // ========================================
            // CREATE MISSING SEATS
            // ========================================

            const newSeats = [];


            for (
                let i = 1;
                i <= 55;
                i++
            ) {

                if (
                    !existingNumbers.has(i)
                ) {

                    newSeats.push({

                        seatNumber: i,

                        status: "available"

                    });

                }

            }


            // ========================================
            // INSERT NEW SEATS
            // ========================================

            if (
                newSeats.length > 0
            ) {

                await Seat.insertMany(
                    newSeats
                );

            }


            // ========================================
            // TOTAL SEATS
            // ========================================

            const totalSeats =
                await Seat.countDocuments();


            return res.send(
                `${newSeats.length} new seats created. Total seats: ${totalSeats}`
            );

        } catch (err) {

            console.error(
                "Seat creation error:",
                err
            );


            return res
                .status(500)
                .send(
                    "Error creating seats"
                );

        }

    }
);


// ========================================
// 404 PAGE
// ========================================

app.use(
    (req, res) => {

        return res
            .status(404)
            .send(
                "Page not found"
            );

    }
);


// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use(
    (err, req, res, next) => {

        console.error(
            "Server Error:",
            err
        );


        if (res.headersSent) {

            return next(err);

        }


        return res
            .status(500)
            .send(
                "Something went wrong!"
            );

    }
);


// ========================================
// PORT
// ========================================

const PORT =
    process.env.PORT || 8080;


// ========================================
// DATABASE + SERVER START
// ========================================

mongoose
    .connect(
        process.env.MONGO_URI
    )
    .then(() => {

        console.log(
            "MongoDB connected successfully"
        );


        app.listen(
            PORT,
            () => {

                console.log(
                    `KAVIKA server is running on port ${PORT}`
                );

            }
        );

    })
    .catch(
        (err) => {

            console.error(
                "MongoDB connection failed:",
                err
            );

            process.exit(1);

        }
    );

