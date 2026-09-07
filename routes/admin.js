
// ========================================
// ADMIN ROUTES
// ========================================

const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ========================================
// MODELS
// ========================================

const User = require("../models/User");
const Seat = require("../models/Seat");
const Booking = require("../models/booking");
const HomeImage = require("../models/HomeImage");
const Pricing = require("../models/Pricing");


// ========================================
// ADMIN MIDDLEWARE
// ========================================

function isAdmin(req, res, next) {

    if (
        req.session &&
        req.session.userId &&
        req.session.userRole === "admin"
    ) {
        return next();
    }

    return res.status(403).send(
        "Access Denied! Admin only."
    );
}


// ========================================
// HOME IMAGE UPLOAD FOLDER
// ========================================

const homeImagePath = path.join(
    __dirname,
    "../public/images/home"
);

if (!fs.existsSync(homeImagePath)) {

    fs.mkdirSync(
        homeImagePath,
        {
            recursive: true
        }
    );
}


// ========================================
// ALLOWED IMAGE TYPES
// ========================================

const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif"
];

const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif"
];


// ========================================
// MULTER STORAGE
// ========================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(
            null,
            homeImagePath
        );
    },

    filename: function (req, file, cb) {

        const extension =
            path.extname(
                file.originalname
            ).toLowerCase();

        const uniqueName =
            `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

        cb(
            null,
            uniqueName
        );
    }

});


// ========================================
// IMAGE FILTER
// ========================================

const fileFilter = (
    req,
    file,
    cb
) => {

    const extension =
        path.extname(
            file.originalname
        ).toLowerCase();

    if (
        allowedMimeTypes.includes(
            file.mimetype
        ) &&
        allowedExtensions.includes(
            extension
        )
    ) {

        return cb(
            null,
            true
        );
    }

    return cb(
        new Error(
            "Only JPG, JPEG, PNG, WEBP and GIF images are allowed."
        )
    );
};


// ========================================
// MULTER CONFIG
// ========================================

const uploadHomeImage = multer({

    storage,

    fileFilter,

    limits: {
        fileSize: 5 * 1024 * 1024
    }

});


// ========================================
// DELETE IMAGE FILE
// ========================================

function deleteImageFile(imageUrl) {

    if (
        !imageUrl ||
        typeof imageUrl !== "string"
    ) {
        return;
    }

    // Only allow files inside /images/home
    if (
        !imageUrl.startsWith(
            "/images/home/"
        )
    ) {
        return;
    }

    const fileName =
        path.basename(
            imageUrl
        );

    const imagePath =
        path.join(
            homeImagePath,
            fileName
        );

    if (
        fs.existsSync(imagePath)
    ) {

        try {

            fs.unlinkSync(
                imagePath
            );

        } catch (err) {

            console.error(
                "Image delete error:",
                err
            );
        }
    }
}


// ========================================
// DATE VALIDATION
// ========================================

function isValidDateString(dateString) {

    if (
        typeof dateString !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
            dateString
        )
    ) {
        return false;
    }

    const [
        year,
        month,
        day
    ] =
        dateString
            .split("-")
            .map(Number);

    if (
        month < 1 ||
        month > 12
    ) {
        return false;
    }

    const daysInMonth =
        new Date(
            Date.UTC(
                year,
                month,
                0
            )
        ).getUTCDate();

    return (
        day >= 1 &&
        day <= daysInMonth
    );
}


// ========================================
// INDIA DATE RANGE
// ========================================

function getIndiaDateRange(
    startDateString,
    endDateString
) {

    const startDate =
        new Date(
            `${startDateString}T00:00:00.000+05:30`
        );

    const endDate =
        new Date(
            `${endDateString}T23:59:59.999+05:30`
        );

    return {
        startDate,
        endDate
    };
}


// ========================================
// ADMIN DASHBOARD
// GET /admin
// ========================================

router.get(
    "/",
    isAdmin,
    async (req, res) => {

        try {

            // ========================================
            // USERS
            // Never load passwords
            // ========================================

            const users =
                await User.find()
                    .select("-password")
                    .sort({
                        createdAt: -1
                    })
                    .lean();


            // ========================================
            // SEATS
            // ========================================

            const seats =
                await Seat.find()
                    .sort({
                        seatNumber: 1
                    })
                    .lean();


            // ========================================
            // BOOKINGS
            // IMPORTANT:
            // Populate USER + SEAT
            // ========================================

            const bookings =
                await Booking.find()
                    .populate({
                        path: "user",
                        select: "name email phone role isVerified isEmailVerified"
                    })
                    .populate({
                        path: "seat",
                        select: "seatNumber"
                    })
                    .sort({
                        createdAt: -1
                    })
                    .lean();


            // ========================================
            // FIX BOOKING USER DATA
            // ========================================
            // If populate works, booking.user already
            // contains name/email/phone.
            //
            // The fallback map below also checks the
            // complete users list using ObjectId.
            // ========================================

            const userMap = new Map();

            for (
                const user of users
            ) {

                if (
                    user &&
                    user._id
                ) {

                    userMap.set(
                        user._id.toString(),
                        user
                    );
                }
            }


            for (
                const booking of bookings
            ) {

                if (
                    booking.user
                ) {

                    const userId =
                        booking.user._id
                            ? booking.user._id.toString()
                            : null;

                    if (
                        userId &&
                        userMap.has(userId)
                    ) {

                        const originalUser =
                            userMap.get(
                                userId
                            );

                        booking.user = {

                            ...originalUser,

                            // Never expose password
                            password: undefined

                        };
                    }

                } else {

                    // ========================================
                    // USER DOCUMENT DOES NOT EXIST
                    // ========================================

                    booking.user = null;
                }
            }


            // ========================================
            // HOME IMAGES
            // ========================================

            const homeImages =
                await HomeImage.find()
                    .sort({
                        type: 1
                    })
                    .lean();


            // ========================================
            // PRICING
            // ========================================

            const pricingDocuments =
                await Pricing.find()
                    .lean();


            // ========================================
            // DEFAULT PRICES
            // ========================================

            const pricing = {

                day: 500,

                night: 300,

                fullDay: 650

            };


            // ========================================
            // DATABASE PRICES
            // ========================================

            for (
                const item of pricingDocuments
            ) {

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

                if (
                    item.type === "fullDay"
                ) {

                    pricing.fullDay =
                        Number(item.price);
                }
            }


            // ========================================
            // STATISTICS
            // ========================================

            const totalUsers =
                users.length;

            const totalSeats =
                seats.length;

            const totalBookings =
                bookings.length;

            const activeBookings =
                bookings.filter(
                    booking =>
                        booking.status ===
                        "confirmed"
                ).length;

            const cancelledBookings =
                bookings.filter(
                    booking =>
                        booking.status ===
                        "cancelled"
                ).length;


            // ========================================
            // RENDER
            // ========================================

            return res.render(
                "admin/index",
                {

                    users,

                    seats,

                    bookings,

                    homeImages,

                    pricing,

                    totalUsers,

                    totalSeats,

                    totalBookings,

                    activeBookings,

                    cancelledBookings

                }
            );

        } catch (err) {

            console.error(
                "Admin dashboard error:",
                err
            );

            return res.status(500).send(
                "Admin dashboard error."
            );
        }
    }
);


// ========================================
// UPDATE HOME IMAGE
// POST /admin/home-image
// ========================================

router.post(
    "/home-image",
    isAdmin,
    uploadHomeImage.single("image"),
    async (req, res) => {

        try {

            const type =
                typeof req.body.type === "string"
                    ? req.body.type.trim()
                    : "";


            // ========================================
            // VALID TYPE
            // ========================================

            if (
                ![
                    "hero",
                    "about"
                ].includes(type)
            ) {

                if (
                    req.file &&
                    fs.existsSync(
                        req.file.path
                    )
                ) {

                    fs.unlinkSync(
                        req.file.path
                    );
                }

                return res.status(400).send(
                    "Invalid home image type."
                );
            }


            // ========================================
            // CHECK FILE
            // ========================================

            if (!req.file) {

                return res.status(400).send(
                    "Please select an image."
                );
            }


            // ========================================
            // FIND OLD IMAGE
            // ========================================

            const oldImage =
                await HomeImage.findOne({
                    type
                });


            // ========================================
            // NEW IMAGE URL
            // ========================================

            const newImagePath =
                `/images/home/${req.file.filename}`;


            // ========================================
            // UPDATE DATABASE
            // ========================================

            await HomeImage.findOneAndUpdate(

                {
                    type
                },

                {
                    type,
                    image: newImagePath
                },

                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );


            // ========================================
            // DELETE OLD FILE
            // ========================================

            if (
                oldImage &&
                oldImage.image &&
                oldImage.image !== newImagePath
            ) {

                deleteImageFile(
                    oldImage.image
                );
            }


            // ========================================
            // SUCCESS
            // ========================================

            return res.redirect(
                "/admin"
            );

        } catch (err) {

            console.error(
                "Home image upload error:",
                err
            );

            if (
                req.file &&
                fs.existsSync(
                    req.file.path
                )
            ) {

                try {

                    fs.unlinkSync(
                        req.file.path
                    );

                } catch (fileError) {

                    console.error(
                        "Uploaded file cleanup error:",
                        fileError
                    );
                }
            }

            return res.status(500).send(
                "Unable to update home image."
            );
        }
    }
);


// ========================================
// DELETE HOME IMAGE
// POST /admin/home-image/delete/:type
// ========================================

router.post(
    "/home-image/delete/:type",
    isAdmin,
    async (req, res) => {

        try {

            const type =
                req.params.type;


            // ========================================
            // VALID TYPE
            // ========================================

            if (
                ![
                    "hero",
                    "about"
                ].includes(type)
            ) {

                return res.status(400).send(
                    "Invalid image type."
                );
            }


            // ========================================
            // FIND IMAGE
            // ========================================

            const image =
                await HomeImage.findOne({
                    type
                });


            if (!image) {

                return res.redirect(
                    "/admin"
                );
            }


            // ========================================
            // DELETE FILE
            // ========================================

            if (image.image) {

                deleteImageFile(
                    image.image
                );
            }


            // ========================================
            // DELETE DATABASE RECORD
            // ========================================

            await HomeImage.findOneAndDelete({
                type
            });


            return res.redirect(
                "/admin"
            );

        } catch (err) {

            console.error(
                "Home image delete error:",
                err
            );

            return res.status(500).send(
                "Unable to delete home image."
            );
        }
    }
);


// ========================================
// UPDATE PRICING
// POST /admin/pricing
// ========================================

router.post(
    "/pricing",
    isAdmin,
    async (req, res) => {

        try {

            const type =
                typeof req.body.type === "string"
                    ? req.body.type.trim()
                    : "";


            const price =
                Number(
                    req.body.price
                );


            // ========================================
            // VALID TYPES
            // ========================================

            const allowedTypes = [
                "day",
                "night",
                "fullDay"
            ];


            if (
                !allowedTypes.includes(type)
            ) {

                return res.status(400).send(
                    "Invalid pricing type."
                );
            }


            // ========================================
            // VALID PRICE
            // ========================================

            if (
                !Number.isFinite(price) ||
                price < 1 ||
                price > 1000000
            ) {

                return res.status(400).send(
                    "Please enter a valid price."
                );
            }


            // ========================================
            // LABEL + TIME
            // ========================================

            let label;
            let time;


            if (
                type === "day"
            ) {

                label = "Day";
                time = "Day";

            } else if (
                type === "night"
            ) {

                label = "Night";
                time = "Night";

            } else {

                label = "Day + Night";
                time = "Full Day";
            }


            // ========================================
            // CREATE / UPDATE
            // ========================================

            await Pricing.findOneAndUpdate(

                {
                    type
                },

                {
                    type,
                    price,
                    label,
                    time
                },

                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );


            return res.redirect(
                "/admin"
            );

        } catch (err) {

            console.error(
                "Pricing update error:",
                err
            );

            return res.status(500).send(
                "Unable to update price."
            );
        }
    }
);


// ========================================
// DELETE PRICING
// POST /admin/pricing/delete/:type
// ========================================

router.post(
    "/pricing/delete/:type",
    isAdmin,
    async (req, res) => {

        try {

            const type =
                req.params.type;


            const allowedTypes = [
                "day",
                "night",
                "fullDay"
            ];


            if (
                !allowedTypes.includes(type)
            ) {

                return res.status(400).send(
                    "Invalid pricing type."
                );
            }


            await Pricing.findOneAndDelete({
                type
            });


            return res.redirect(
                "/admin"
            );

        } catch (err) {

            console.error(
                "Pricing delete error:",
                err
            );

            return res.status(500).send(
                "Unable to delete price."
            );
        }
    }
);


// ========================================
// ASSIGN SEAT TO USER
// POST /admin/bookings/assign
// ========================================

router.post(
    "/bookings/assign",
    isAdmin,
    async (req, res) => {

        try {

            const {
                userId,
                seatId,
                startDate,
                endDate
            } = req.body;


            // ========================================
            // REQUIRED FIELDS
            // ========================================

            if (
                !userId ||
                !seatId ||
                !startDate ||
                !endDate
            ) {

                return res.status(400).send(
                    "Please fill all fields."
                );
            }


            // ========================================
            // VALID USER ID
            // ========================================

            if (
                !mongoose.Types.ObjectId.isValid(
                    userId
                )
            ) {

                return res.status(400).send(
                    "Invalid user ID."
                );
            }


            // ========================================
            // VALID SEAT ID
            // ========================================

            if (
                !mongoose.Types.ObjectId.isValid(
                    seatId
                )
            ) {

                return res.status(400).send(
                    "Invalid seat ID."
                );
            }


            // ========================================
            // VALID DATES
            // ========================================

            if (
                !isValidDateString(
                    startDate
                ) ||
                !isValidDateString(
                    endDate
                )
            ) {

                return res.status(400).send(
                    "Invalid date."
                );
            }


            // ========================================
            // DATE RANGE
            // ========================================

            const {
                startDate: newStartDate,
                endDate: newEndDate
            } =
                getIndiaDateRange(
                    startDate,
                    endDate
                );


            // ========================================
            // DATE CHECK
            // ========================================

            if (
                isNaN(
                    newStartDate.getTime()
                ) ||
                isNaN(
                    newEndDate.getTime()
                )
            ) {

                return res.status(400).send(
                    "Invalid date."
                );
            }


            // ========================================
            // DATE ORDER CHECK
            // ========================================

            if (
                newEndDate <
                newStartDate
            ) {

                return res.status(400).send(
                    "End date cannot be before start date."
                );
            }


            // ========================================
            // FIND USER
            // ========================================

            const user =
                await User.findById(
                    userId
                ).select("_id name email phone");


            if (!user) {

                return res.status(404).send(
                    "User not found."
                );
            }


            // ========================================
            // FIND SEAT
            // ========================================

            const seat =
                await Seat.findById(
                    seatId
                ).select("_id seatNumber");


            if (!seat) {

                return res.status(404).send(
                    "Seat not found."
                );
            }


            // ========================================
            // CHECK OVERLAPPING BOOKING
            // ========================================

            const existingBooking =
                await Booking.findOne({

                    seat: seatId,

                    status: "confirmed",

                    startDate: {
                        $lte: newEndDate
                    },

                    endDate: {
                        $gte: newStartDate
                    }

                }).select("_id bookingNumber");


            if (existingBooking) {

                return res.status(400).send(
                    "This seat is already booked for the selected dates."
                );
            }


            // ========================================
            // ADMIN BOOKING TYPE
            // ========================================

            const bookingType =
                "fullDay";


            // ========================================
            // GET FULL DAY PRICE
            // ========================================

            const pricing =
                await Pricing.findOne({
                    type: bookingType
                }).lean();


            if (!pricing) {

                return res.status(400).send(
                    "Full Day price has not been set by admin."
                );
            }


            // ========================================
            // VALID PRICE
            // ========================================

            const pricePerMonth =
                Number(
                    pricing.price
                );


            if (
                !Number.isFinite(
                    pricePerMonth
                ) ||
                pricePerMonth < 1
            ) {

                return res.status(400).send(
                    "Invalid Full Day price."
                );
            }


            // ========================================
            // DURATION
            // ========================================

            const millisecondsPerDay =
                1000 *
                60 *
                60 *
                24;


            const durationDays =
                Math.floor(
                    (
                        newEndDate -
                        newStartDate
                    ) /
                    millisecondsPerDay
                ) + 1;


            // ========================================
            // PRICE
            // ========================================

            const pricePerDay =
                pricePerMonth / 30;


            const totalAmount =
                Math.max(
                    1,
                    Math.round(
                        pricePerDay *
                        durationDays
                    )
                );


            // ========================================
            // DURATION MONTHS
            // ========================================

            const durationMonths =
                Math.floor(
                    durationDays / 30
                );


            // ========================================
            // BOOKING NUMBER
            // ========================================

            const bookingNumber =
                "KVK-ADM-" +
                Date.now() +
                "-" +
                crypto
                    .randomBytes(4)
                    .toString("hex")
                    .toUpperCase();


            // ========================================
            // CREATE BOOKING
            // ========================================

            const booking =
                new Booking({

                    bookingNumber,

                    user:
                        user._id,

                    seat:
                        seat._id,

                    bookingType,

                    startDate:
                        newStartDate,

                    endDate:
                        newEndDate,

                    durationDays,

                    durationMonths,

                    pricePerMonth,

                    totalAmount,

                    // Admin manually confirmed booking
                    paymentStatus:
                        "paid",

                    status:
                        "confirmed"

                });


            // ========================================
            // SAVE BOOKING
            // ========================================

            await booking.save();


            // ========================================
            // SUCCESS
            // ========================================

            return res.redirect(
                "/admin"
            );

        } catch (err) {

            // ========================================
            // DUPLICATE BOOKING NUMBER
            // ========================================

            if (
                err &&
                err.code === 11000
            ) {

                return res.status(409).send(
                    "Booking number already exists. Please try again."
                );
            }


            console.error(
                "Admin seat assignment error:",
                err
            );

            return res.status(500).send(
                "Unable to assign seat."
            );
        }
    }
);


// ========================================
// CANCEL BOOKING
// POST /admin/bookings/:id/cancel
// ========================================

router.post(
    "/bookings/:id/cancel",
    isAdmin,
    async (req, res) => {

        try {

            const bookingId =
                req.params.id;


            // ========================================
            // VALIDATE ID
            // ========================================

            if (
                !mongoose.Types.ObjectId.isValid(
                    bookingId
                )
            ) {

                return res.status(400).send(
                    "Invalid booking ID."
                );
            }


            // ========================================
            // FIND BOOKING
            // ========================================

            const booking =
                await Booking.findById(
                    bookingId
                );


            if (!booking) {

                return res.status(404).send(
                    "Booking not found."
                );
            }


            // ========================================
            // ALREADY CANCELLED
            // ========================================

            if (
                booking.status ===
                "cancelled"
            ) {

                return res.redirect(
                    "/admin"
                );
            }


            // ========================================
            // PAYMENT WARNING
            // ========================================

            if (
                booking.paymentStatus ===
                "paid"
            ) {

                console.log(
                    `Paid booking ${booking.bookingNumber} cancelled by admin. Refund may require manual handling.`
                );
            }


            // ========================================
            // CANCEL BOOKING
            // ========================================

            await Booking.findByIdAndUpdate(

                bookingId,

                {
                    $set: {
                        status: "cancelled"
                    }
                },

                {
                    new: true,
                    runValidators: false
                }
            );


            return res.redirect(
                "/admin"
            );

        } catch (err) {

            console.error(
                "Booking cancellation error:",
                err
            );

            return res.status(500).send(
                "Unable to cancel booking."
            );
        }
    }
);


// ========================================
// ADMIN BOOKINGS
// GET /admin/bookings
// ========================================

router.get(
    "/bookings",
    isAdmin,
    async (req, res) => {

        try {

            const bookings =
                await Booking.find()
                    .populate({
                        path: "user",
                        select: "name email phone role isVerified isEmailVerified"
                    })
                    .populate({
                        path: "seat",
                        select: "seatNumber"
                    })
                    .sort({
                        createdAt: -1
                    });


            return res.render(
                "admin/bookings",
                {
                    bookings
                }
            );

        } catch (err) {

            console.error(
                "Admin bookings error:",
                err
            );

            return res.status(500).send(
                "Unable to load bookings."
            );
        }
    }
);


// ========================================
// ADMIN USERS
// GET /admin/users
// ========================================

router.get(
    "/users",
    isAdmin,
    async (req, res) => {

        try {

            const users =
                await User.find()
                    .select("-password")
                    .sort({
                        createdAt: -1
                    });


            return res.render(
                "admin/users",
                {
                    users
                }
            );

        } catch (err) {

            console.error(
                "Admin users error:",
                err
            );

            return res.status(500).send(
                "Unable to load users."
            );
        }
    }
);


// ========================================
// ADMIN SEATS
// GET /admin/seats
// ========================================

router.get(
    "/seats",
    isAdmin,
    async (req, res) => {

        try {

            const seats =
                await Seat.find()
                    .sort({
                        seatNumber: 1
                    });


            return res.render(
                "admin/seats",
                {
                    seats
                }
            );

        } catch (err) {

            console.error(
                "Admin seats error:",
                err
            );

            return res.status(500).send(
                "Unable to load seats."
            );
        }
    }
);


// ========================================
// MULTER ERROR HANDLER
// ========================================

router.use(
    (
        err,
        req,
        res,
        next
    ) => {

        if (
            err instanceof multer.MulterError
        ) {

            if (
                err.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(400).send(
                    "Image size cannot exceed 5 MB."
                );
            }

            return res.status(400).send(
                "Image upload failed."
            );
        }


        if (
            err &&
            err.message &&
            err.message.includes(
                "Only JPG"
            )
        ) {

            return res.status(400).send(
                err.message
            );
        }


        return next(err);
    }
);


// ========================================
// EXPORT
// ========================================

module.exports = router;

