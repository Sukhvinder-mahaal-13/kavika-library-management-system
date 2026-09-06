
const express = require("express");
const router = express.Router();

const User = require("../models/User");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// ========================================
// EMAIL CONFIGURATION
// ========================================

const emailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ========================================
// EMAIL CONFIGURATION CHECK
// ========================================

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(
        "WARNING: EMAIL_USER or EMAIL_PASS is missing."
    );
}

// ========================================
// TEMPORARY REGISTRATION STORAGE
// ========================================

const pendingRegistrations = new Map();

// ========================================
// OTP SETTINGS
// ========================================

const OTP_EXPIRY = 5 * 60 * 1000;

// Prevent repeated OTP requests
const RESEND_COOLDOWN = 60 * 1000;

// Maximum number of resend attempts
const MAX_RESEND_ATTEMPTS = 5;

// ========================================
// GENERATE OTP
// ========================================

function generateOTP() {
    return crypto
        .randomInt(100000, 1000000)
        .toString();
}

// ========================================
// GENERATE REGISTRATION ID
// ========================================

function generateRegistrationId() {
    return crypto.randomBytes(24).toString("hex");
}

// ========================================
// REGISTER PAGE
// GET /users/register
// ========================================

router.get("/register", (req, res) => {
    return res.render("users/register");
});

// ========================================
// START REGISTRATION
// POST /users/register
// ========================================

router.post("/register", async (req, res) => {
    try {

        const {
            name,
            email,
            phone,
            password
        } = req.body;

        // ========================================
        // REQUIRED FIELDS
        // ========================================

        if (
            !name ||
            !email ||
            !phone ||
            !password
        ) {
            return res.status(400).send(
                "Please fill all the fields!"
            );
        }

        // ========================================
        // CLEAN DATA
        // ========================================

        const cleanName = String(name).trim();

        const cleanEmail = String(email)
            .trim()
            .toLowerCase();

        const cleanPhone = String(phone)
            .trim()
            .replace(/\s+/g, "");

        const cleanPassword = String(password);

        // ========================================
        // NAME VALIDATION
        // ========================================

        if (
            cleanName.length < 2 ||
            cleanName.length > 100
        ) {
            return res.status(400).send(
                "Please enter a valid name!"
            );
        }

        // ========================================
        // EMAIL VALIDATION
        // ========================================

        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).send(
                "Please enter a valid email address!"
            );
        }

        // ========================================
        // PHONE VALIDATION
        // ========================================

        if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
            return res.status(400).send(
                "Please enter a valid 10 digit mobile number!"
            );
        }

        // ========================================
        // PASSWORD VALIDATION
        // ========================================

        if (cleanPassword.length < 6) {
            return res.status(400).send(
                "Password must be at least 6 characters!"
            );
        }

        if (cleanPassword.length > 128) {
            return res.status(400).send(
                "Password cannot exceed 128 characters!"
            );
        }

        // ========================================
        // CHECK EXISTING EMAIL
        // ========================================

        const existingEmail = await User.findOne({
            email: cleanEmail
        }).select("_id");

        if (existingEmail) {
            return res.status(400).send(
                "Email already registered!"
            );
        }

        // ========================================
        // CHECK EXISTING PHONE
        // ========================================

        const existingPhone = await User.findOne({
            phone: cleanPhone
        }).select("_id");

        if (existingPhone) {
            return res.status(400).send(
                "Mobile number already registered!"
            );
        }

        // ========================================
        // GENERATE EMAIL OTP
        // ========================================

        const emailOTP = generateOTP();

        // ========================================
        // CREATE REGISTRATION ID
        // ========================================

        const registrationId =
            generateRegistrationId();

        // ========================================
        // SAVE TEMPORARY REGISTRATION
        // ========================================

        pendingRegistrations.set(
            registrationId,
            {
                name: cleanName,
                email: cleanEmail,
                phone: cleanPhone,
                password: cleanPassword,

                emailOTP: emailOTP,
                emailVerified: false,

                expiresAt:
                    Date.now() + OTP_EXPIRY,

                lastOtpSentAt:
                    Date.now(),

                resendAttempts: 0
            }
        );

        // ========================================
        // SEND EMAIL OTP
        // ========================================

        try {

            await emailTransporter.sendMail({

                from:
                    `"KAVIKA Library" <${process.env.EMAIL_USER}>`,

                to:
                    cleanEmail,

                subject:
                    "KAVIKA - Email Verification OTP",

                text:
                    `Your KAVIKA email verification OTP is ${emailOTP}. This OTP is valid for 5 minutes.`,

                html: `
                    <div style="
                        font-family: Arial, sans-serif;
                        max-width: 550px;
                        margin: auto;
                        padding: 30px;
                        background: #111;
                        color: #fff;
                        border-radius: 15px;
                    ">

                        <h1 style="
                            letter-spacing: 5px;
                            margin-bottom: 10px;
                        ">
                            KAVIKA
                        </h1>

                        <p>
                            Welcome to KAVIKA Library.
                        </p>

                        <p>
                            Your email verification OTP is:
                        </p>

                        <div style="
                            font-size: 32px;
                            font-weight: bold;
                            letter-spacing: 8px;
                            padding: 20px;
                            margin: 20px 0;
                            text-align: center;
                            background: #222;
                            border-radius: 10px;
                        ">
                            ${emailOTP}
                        </div>

                        <p>
                            This OTP is valid for
                            <strong>5 minutes</strong>.
                        </p>

                        <p style="
                            color: #aaa;
                            font-size: 13px;
                        ">
                            If you did not create a KAVIKA
                            account, you can ignore this email.
                        </p>

                    </div>
                `
            });

        } catch (emailError) {

            console.error(
                "Email OTP error:",
                emailError
            );

            pendingRegistrations.delete(
                registrationId
            );

            return res.status(500).send(
                "Unable to send email OTP. Please check your email configuration."
            );
        }

        // ========================================
        // SAVE REGISTRATION ID IN SESSION
        // ========================================

        req.session.registrationId =
            registrationId;

        // ========================================
        // SAVE SESSION
        // ========================================

        req.session.save((err) => {

            if (err) {

                console.error(
                    "Registration session error:",
                    err
                );

                pendingRegistrations.delete(
                    registrationId
                );

                return res.status(500).send(
                    "Unable to start verification."
                );
            }

            return res.redirect(
                "/users/verify-otp"
            );
        });

    } catch (err) {

        console.error(
            "Registration error:",
            err
        );

        return res.status(500).send(
            "Registration failed."
        );
    }
});

// ========================================
// EMAIL OTP VERIFICATION PAGE
// GET /users/verify-otp
// ========================================

router.get("/verify-otp", (req, res) => {

    const registrationId =
        req.session.registrationId;

    // ========================================
    // SESSION CHECK
    // ========================================

    if (!registrationId) {
        return res.redirect(
            "/users/register"
        );
    }

    // ========================================
    // GET REGISTRATION
    // ========================================

    const registration =
        pendingRegistrations.get(
            registrationId
        );

    if (!registration) {

        delete req.session.registrationId;

        return res.redirect(
            "/users/register"
        );
    }

    // ========================================
    // EXPIRY CHECK
    // ========================================

    if (
        Date.now() >
        registration.expiresAt
    ) {

        pendingRegistrations.delete(
            registrationId
        );

        delete req.session.registrationId;

        return res.status(400).send(
            "OTP expired. Please register again."
        );
    }

    // ========================================
    // SHOW OTP PAGE
    // ========================================

    return res.render(
        "users/verify-otp",
        {
            email: registration.email
        }
    );
});

// ========================================
// VERIFY EMAIL OTP
// POST /users/verify-otp
// ========================================

router.post("/verify-otp", async (req, res) => {

    try {

        const {
            emailOTP
        } = req.body;

        // ========================================
        // SESSION CHECK
        // ========================================

        const registrationId =
            req.session.registrationId;

        if (!registrationId) {

            return res.status(400).send(
                "Registration session expired. Please register again."
            );
        }

        // ========================================
        // GET REGISTRATION
        // ========================================

        const registration =
            pendingRegistrations.get(
                registrationId
            );

        if (!registration) {

            delete req.session.registrationId;

            return res.status(400).send(
                "Registration data not found. Please register again."
            );
        }

        // ========================================
        // EXPIRY CHECK
        // ========================================

        if (
            Date.now() >
            registration.expiresAt
        ) {

            pendingRegistrations.delete(
                registrationId
            );

            delete req.session.registrationId;

            return res.status(400).send(
                "OTP expired. Please register again."
            );
        }

        // ========================================
        // EMAIL OTP REQUIRED
        // ========================================

        if (!emailOTP) {

            return res.status(400).send(
                "Please enter the email OTP."
            );
        }

        // ========================================
        // CLEAN OTP
        // ========================================

        const cleanEmailOTP =
            String(emailOTP).trim();

        // ========================================
        // OTP FORMAT
        // ========================================

        if (
            !/^[0-9]{6}$/.test(
                cleanEmailOTP
            )
        ) {

            return res.status(400).send(
                "Please enter a valid 6 digit email OTP."
            );
        }

        // ========================================
        // VERIFY OTP
        // ========================================

        if (
            cleanEmailOTP !==
            registration.emailOTP
        ) {

            return res.status(400).send(
                "Invalid email OTP."
            );
        }

        // ========================================
        // DOUBLE CHECK EMAIL
        // ========================================

        const existingUser =
            await User.findOne({
                $or: [
                    {
                        email:
                            registration.email
                    },
                    {
                        phone:
                            registration.phone
                    }
                ]
            }).select("_id");

        if (existingUser) {

            pendingRegistrations.delete(
                registrationId
            );

            delete req.session.registrationId;

            return res.status(400).send(
                "Email or mobile number is already registered."
            );
        }

        // ========================================
        // HASH PASSWORD
        // ========================================

        const hashedPassword =
            await bcrypt.hash(
                registration.password,
                12
            );

        // ========================================
        // CREATE USER
        // ========================================

        const user = new User({

            name:
                registration.name,

            email:
                registration.email,

            phone:
                registration.phone,

            password:
                hashedPassword,

            isEmailVerified:
                true,

            isVerified:
                true,

            role:
                "student"
        });

        // ========================================
        // SAVE USER
        // ========================================

        await user.save();

        // ========================================
        // REMOVE TEMP DATA
        // ========================================

        pendingRegistrations.delete(
            registrationId
        );

        delete req.session.registrationId;

        // ========================================
        // REDIRECT LOGIN
        // ========================================

        return res.redirect(
            "/users/login?verified=true"
        );

    } catch (err) {

        // ========================================
        // DUPLICATE USER
        // ========================================

        if (err.code === 11000) {

            return res.status(400).send(
                "Email or mobile number is already registered."
            );
        }

        console.error(
            "Email OTP verification error:",
            err
        );

        return res.status(500).send(
            "Email OTP verification failed."
        );
    }
});

// ========================================
// RESEND EMAIL OTP
// POST /users/resend-otp
// ========================================

router.post("/resend-otp", async (req, res) => {

    try {

        // ========================================
        // SESSION CHECK
        // ========================================

        const registrationId =
            req.session.registrationId;

        if (!registrationId) {

            return res.status(400).send(
                "Registration session expired. Please register again."
            );
        }

        // ========================================
        // GET REGISTRATION
        // ========================================

        const registration =
            pendingRegistrations.get(
                registrationId
            );

        if (!registration) {

            delete req.session.registrationId;

            return res.status(400).send(
                "Registration not found. Please register again."
            );
        }

        // ========================================
        // MAX RESEND CHECK
        // ========================================

        if (
            registration.resendAttempts >=
            MAX_RESEND_ATTEMPTS
        ) {

            return res.status(429).send(
                "Maximum OTP resend limit reached. Please register again."
            );
        }

        // ========================================
        // RESEND COOLDOWN
        // ========================================

        const timeSinceLastOTP =
            Date.now() -
            registration.lastOtpSentAt;

        if (
            timeSinceLastOTP <
            RESEND_COOLDOWN
        ) {

            const remainingSeconds =
                Math.ceil(
                    (
                        RESEND_COOLDOWN -
                        timeSinceLastOTP
                    ) / 1000
                );

            return res.status(429).send(
                `Please wait ${remainingSeconds} seconds before requesting another OTP.`
            );
        }

        // ========================================
        // GENERATE NEW OTP
        // ========================================

        const emailOTP =
            generateOTP();

        // ========================================
        // UPDATE REGISTRATION
        // ========================================

        registration.emailOTP =
            emailOTP;

        registration.emailVerified =
            false;

        registration.expiresAt =
            Date.now() + OTP_EXPIRY;

        registration.lastOtpSentAt =
            Date.now();

        registration.resendAttempts += 1;

        // ========================================
        // SEND NEW OTP
        // ========================================

        try {

            await emailTransporter.sendMail({

                from:
                    `"KAVIKA Library" <${process.env.EMAIL_USER}>`,

                to:
                    registration.email,

                subject:
                    "KAVIKA - New Verification OTP",

                text:
                    `Your new KAVIKA email verification OTP is ${emailOTP}. This OTP is valid for 5 minutes.`,

                html: `
                    <div style="
                        font-family: Arial, sans-serif;
                        max-width: 550px;
                        margin: auto;
                        padding: 30px;
                        background: #111;
                        color: #fff;
                        border-radius: 15px;
                    ">

                        <h1 style="
                            letter-spacing: 5px;
                        ">
                            KAVIKA
                        </h1>

                        <p>
                            Your new email verification OTP is:
                        </p>

                        <div style="
                            font-size: 32px;
                            font-weight: bold;
                            letter-spacing: 8px;
                            padding: 20px;
                            margin: 20px 0;
                            text-align: center;
                            background: #222;
                            border-radius: 10px;
                        ">
                            ${emailOTP}
                        </div>

                        <p>
                            This OTP is valid for
                            <strong>5 minutes</strong>.
                        </p>

                    </div>
                `
            });

        } catch (emailError) {

            console.error(
                "Resend email error:",
                emailError
            );

            return res.status(500).send(
                "Unable to resend email OTP."
            );
        }

        // ========================================
        // SUCCESS
        // ========================================

        return res.send(
            "New email OTP has been sent successfully."
        );

    } catch (err) {

        console.error(
            "Resend OTP error:",
            err
        );

        return res.status(500).send(
            "Unable to resend email OTP."
        );
    }
});

// ========================================
// LOGIN PAGE
// GET /users/login
// ========================================

router.get("/login", (req, res) => {

    return res.render(
        "users/login",
        {
            verified:
                req.query.verified === "true"
        }
    );
});

// ========================================
// LOGIN USER
// POST /users/login
// ========================================

router.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;

        // ========================================
        // REQUIRED FIELDS
        // ========================================

        if (
            !email ||
            !password
        ) {

            return res.status(400).send(
                "Please enter email and password!"
            );
        }

        // ========================================
        // CLEAN EMAIL
        // ========================================

        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();

        // ========================================
        // EMAIL VALIDATION
        // ========================================

        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(cleanEmail)) {

            return res.status(400).send(
                "Please enter a valid email address!"
            );
        }

        // ========================================
        // FIND USER
        // PASSWORD IS select:false
        // ========================================

        const user =
            await User.findOne({
                email: cleanEmail
            }).select("+password");

        // ========================================
        // USER NOT FOUND
        // ========================================

        if (!user) {

            return res.status(401).send(
                "Invalid email or password."
            );
        }

        // ========================================
        // VERIFY ACCOUNT
        // ========================================

        if (
            !user.isVerified ||
            !user.isEmailVerified
        ) {

            return res.status(403).send(
                "Please verify your email first."
            );
        }

        // ========================================
        // CHECK PASSWORD
        // ========================================

        const isPasswordCorrect =
            await bcrypt.compare(
                String(password),
                user.password
            );

        if (!isPasswordCorrect) {

            return res.status(401).send(
                "Invalid email or password."
            );
        }

        // ========================================
        // SESSION REGENERATION
        // Prevent session fixation
        // ========================================

        req.session.regenerate((err) => {

            if (err) {

                console.error(
                    "Session regeneration error:",
                    err
                );

                return res.status(500).send(
                    "Login failed."
                );
            }

            // ========================================
            // CREATE NEW SESSION
            // ========================================

            req.session.userId =
                user._id.toString();

            req.session.userRole =
                user.role;

            req.session.userName =
                user.name;

            req.session.userEmail =
                user.email;

            // ========================================
            // SAVE SESSION
            // ========================================

            req.session.save((saveErr) => {

                if (saveErr) {

                    console.error(
                        "Session save error:",
                        saveErr
                    );

                    return res.status(500).send(
                        "Login failed."
                    );
                }

                // ========================================
                // ADMIN
                // ========================================

                if (
                    user.role === "admin"
                ) {

                    return res.redirect(
                        "/admin"
                    );
                }

                // ========================================
                // STUDENT
                // ========================================

                return res.redirect(
                    "/"
                );
            });
        });

    } catch (err) {

        console.error(
            "Login error:",
            err
        );

        return res.status(500).send(
            "Login failed."
        );
    }
});

// ========================================
// LOGOUT USER
// GET /users/logout
// ========================================

router.get("/logout", (req, res) => {

    if (!req.session) {
        return res.redirect("/");
    }

    req.session.destroy((err) => {

        if (err) {

            console.error(
                "Logout error:",
                err
            );

            return res.status(500).send(
                "Logout failed."
            );
        }

        res.clearCookie(
            "connect.sid",
            {
                httpOnly: true,
                sameSite: "lax",
                secure:
                    process.env.NODE_ENV === "production"
            }
        );

        return res.redirect("/");
    });
});

// ========================================
// EXPORT ROUTER
// ========================================

module.exports = router;

