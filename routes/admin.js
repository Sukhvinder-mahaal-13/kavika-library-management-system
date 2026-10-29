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

    return res.status(403).send("Access Denied! Admin only.");
}

// ========================================
// HOME IMAGE UPLOAD FOLDER
// ========================================

const homeImagePath = path.join(
    __dirname,
    "../public/images/home"
);

if (!fs.existsSync(homeImagePath)) {
    fs.mkdirSync(homeImagePath, {
        recursive: true
    });
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
        cb(null, homeImagePath);
    },

    filename: function (req, file, cb) {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        const uniqueName =
            `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

        cb(null, uniqueName);
    }
});

// ========================================
// IMAGE FILTER
// ========================================

const fileFilter = (req, file, cb) => {
    const extension = path
        .extname(file.originalname)
        .toLowerCase();

    if (
        allowedMimeTypes.includes(file.mimetype) &&
        allowedExtensions.includes(extension)
    ) {
        return cb(null, true);
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
        typeof imageUrl !== "string" ||
        !imageUrl.startsWith("/images/home/")
    ) {
        return;
    }

    const fileName = path.basename(imageUrl);
    const imagePath = path.join(homeImagePath, fileName);

    if (fs.existsSync(imagePath)) {
        try {
            fs.unlinkSync(imagePath);
        } catch (err) {
            console.error("Image delete error:", err);
        }
    }
}

// ========================================
// DATE VALIDATION
// ========================================

function isValidDateString(dateString) {
    if (
        typeof dateString !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ) {
        return false;
    }

    const [year, month, day] = dateString
        .split("-")
        .map(Number);

    if (month < 1 || month > 12) {
        return false;
    }

    const daysInMonth = new Date(
        Date.UTC(year, month, 0)
    ).getUTCDate();

    return day >= 1 && day <= daysInMonth;
}

// ========================================
// INDIA DATE RANGE
// ========================================

function getIndiaDateRange(startDateString, endDateString) {
    return {
        startDate: new Date(
            `${startDateString}T00:00:00.000+05:30`
        ),

        endDate: new Date(
            `${endDateString}T23:59:59.999+05:30`
        )
    };
}

// ========================================
// DATE DURATION
// ========================================

function calculateDurationDays(startDate, endDate) {
    // Calculate the duration using the actual timestamps.
    // This avoids UTC calendar-date shifting for Indian dates.

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const difference = endDate.getTime() - startDate.getTime();

    if (!Number.isFinite(difference) || difference < 0) {
        return 0;
    }

    return Math.floor(difference / millisecondsPerDay) + 1;
}

// ========================================
// BOOKING TYPE VALIDATION
// ========================================

function isValidBookingType(type) {
    return ["day", "night", "fullDay"].includes(type);
}

// ========================================
// BOOKING CONFLICT RULES
// ========================================
//
// Full Day conflicts with Day, Night and Full Day.
// Day conflicts with Day and Full Day.
// Night conflicts with Night and Full Day.
// Day and Night may coexist.
//
// ========================================

function bookingTypesConflict(typeA, typeB) {
    if (typeA === "fullDay" || typeB === "fullDay") {
        return true;
    }

    return typeA === typeB;
}

// ========================================
// FIND CONFLICTING BOOKINGS
// ========================================

async function findBookingConflict({
    seatId,
    bookingType,
    startDate,
    endDate,
    excludeBookingId = null
}) {
    const query = {
        seat: seatId,

        status: {
            $ne: "cancelled"
        },

        startDate: {
            $lte: endDate
        },

        endDate: {
            $gte: startDate
        },

        $or: [
            {
                status: "confirmed"
            },
            {
                approvalStatus: "approved"
            }
        ]
    };

    if (excludeBookingId) {
        query._id = {
            $ne: excludeBookingId
        };
    }

    const overlappingBookings = await Booking.find(query)
        .select(
            "_id bookingType bookingNumber status approvalStatus paymentStatus"
        )
        .lean();

    return overlappingBookings.find(existingBooking => {
        // Older records without bookingType are treated as Full Day.
        const existingType =
            existingBooking.bookingType || "fullDay";

        return bookingTypesConflict(
            bookingType,
            existingType
        );
    }) || null;
}

// ========================================
// ADMIN DASHBOARD
// GET /admin
// ========================================

router.get("/", isAdmin, async (req, res) => {
    try {
        const users = await User.find()
            .select("-password")
            .sort({ createdAt: -1 })
            .lean();

        const seats = await Seat.find()
            .sort({ seatNumber: 1 })
            .lean();

        const bookings = await Booking.find()
            .populate({
                path: "user",
                select: "name email phone role isVerified isEmailVerified"
            })
            .populate({
                path: "seat",
                select: "seatNumber"
            })
            .sort({ createdAt: -1 })
            .lean();

        // ========================================
        // FIX BOOKING USER DATA
        // ========================================

        const userMap = new Map();

        for (const user of users) {
            if (user && user._id) {
                userMap.set(user._id.toString(), user);
            }
        }

        for (const booking of bookings) {
            if (booking.user && booking.user._id) {
                const userId = booking.user._id.toString();

                if (userMap.has(userId)) {
                    booking.user = userMap.get(userId);
                }
            } else {
                booking.user = null;
            }

            // Compatibility for older bookings.
            if (!booking.approvalStatus) {
                booking.approvalStatus =
                    booking.status === "confirmed"
                        ? "approved"
                        : "pending";
            }
        }

        // ========================================
        // HOME IMAGES
        // ========================================

        const homeImages = await HomeImage.find()
            .sort({ type: 1 })
            .lean();

        // ========================================
        // PRICING
        // ========================================

        const pricingDocuments = await Pricing.find().lean();

        const pricing = {
            day: 500,
            night: 300,
            fullDay: 650
        };

        for (const item of pricingDocuments) {
            if (
                ["day", "night", "fullDay"].includes(item.type) &&
                Number.isFinite(Number(item.price))
            ) {
                pricing[item.type] = Number(item.price);
            }
        }

        // ========================================
        // STATISTICS
        // ========================================

        const totalUsers = users.length;
        const totalSeats = seats.length;
        const totalBookings = bookings.length;

        const activeBookings = bookings.filter(
            booking => booking.status === "confirmed"
        ).length;

        const cancelledBookings = bookings.filter(
            booking => booking.status === "cancelled"
        ).length;

        // ========================================
        // RENDER DASHBOARD
        // ========================================

        return res.render("admin/index", {
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
        });
    } catch (err) {
        console.error("Admin dashboard error:", err);
        return res.status(500).send("Admin dashboard error.");
    }
});

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

            if (!["hero", "about"].includes(type)) {
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }

                return res.status(400).send(
                    "Invalid home image type."
                );
            }

            if (!req.file) {
                return res.status(400).send(
                    "Please select an image."
                );
            }

            const oldImage = await HomeImage.findOne({ type });

            const newImagePath =
                `/images/home/${req.file.filename}`;

            await HomeImage.findOneAndUpdate(
                { type },
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

            if (
                oldImage &&
                oldImage.image &&
                oldImage.image !== newImagePath
            ) {
                deleteImageFile(oldImage.image);
            }

            return res.redirect("/admin");
        } catch (err) {
            console.error("Home image upload error:", err);

            if (req.file && fs.existsSync(req.file.path)) {
                try {
                    fs.unlinkSync(req.file.path);
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
            const type = req.params.type;

            if (!["hero", "about"].includes(type)) {
                return res.status(400).send(
                    "Invalid image type."
                );
            }

            const image = await HomeImage.findOne({ type });

            if (!image) {
                return res.redirect("/admin");
            }

            if (image.image) {
                deleteImageFile(image.image);
            }

            await HomeImage.findOneAndDelete({ type });

            return res.redirect("/admin");
        } catch (err) {
            console.error("Home image delete error:", err);

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

router.post("/pricing", isAdmin, async (req, res) => {
    try {
        const type =
            typeof req.body.type === "string"
                ? req.body.type.trim()
                : "";

        const price = Number(req.body.price);

        if (!["day", "night", "fullDay"].includes(type)) {
            return res.status(400).send(
                "Invalid pricing type."
            );
        }

        if (
            !Number.isFinite(price) ||
            price < 1 ||
            price > 1000000
        ) {
            return res.status(400).send(
                "Please enter a valid price."
            );
        }

        let label;
        let time;

        if (type === "day") {
            label = "Day";
            time = "Day";
        } else if (type === "night") {
            label = "Night";
            time = "Night";
        } else {
            label = "Day + Night";
            time = "Full Day";
        }

        await Pricing.findOneAndUpdate(
            { type },
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

        return res.redirect("/admin");
    } catch (err) {
        console.error("Pricing update error:", err);

        return res.status(500).send(
            "Unable to update price."
        );
    }
});

// ========================================
// DELETE PRICING
// POST /admin/pricing/delete/:type
// ========================================

router.post(
    "/pricing/delete/:type",
    isAdmin,
    async (req, res) => {
        try {
            const type = req.params.type;

            if (!["day", "night", "fullDay"].includes(type)) {
                return res.status(400).send(
                    "Invalid pricing type."
                );
            }

            await Pricing.findOneAndDelete({ type });

            return res.redirect("/admin");
        } catch (err) {
            console.error("Pricing delete error:", err);

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
//
// Supported form fields:
// userId, seatId, bookingType, startDate, endDate,
// paymentStatus, paymentMethod, amountPaid,
// paymentReceivedAt, paymentReference, paymentNotes
//
// Defaults to unpaid if payment fields are absent.
//
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

            const bookingType =
                req.body.bookingType || "fullDay";

            const requestedPaymentStatus =
                req.body.paymentStatus || "pending";

            const requestedPaymentMethod =
                req.body.paymentMethod || "";

            const paymentReference =
                typeof req.body.paymentReference === "string"
                    ? req.body.paymentReference.trim()
                    : "";

            const paymentNotes =
                typeof req.body.paymentNotes === "string"
                    ? req.body.paymentNotes.trim()
                    : "";

            if (
                !userId ||
                !seatId ||
                !startDate ||
                !endDate
            ) {
                return res.status(400).send(
                    "Please fill all required fields."
                );
            }

            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).send("Invalid user ID.");
            }

            if (!mongoose.Types.ObjectId.isValid(seatId)) {
                return res.status(400).send("Invalid seat ID.");
            }

            if (!isValidBookingType(bookingType)) {
                return res.status(400).send(
                    "Invalid booking type."
                );
            }

            if (
                !["pending", "paid"].includes(
                    requestedPaymentStatus
                )
            ) {
                return res.status(400).send(
                    "Invalid payment status."
                );
            }

            if (
                !isValidDateString(startDate) ||
                !isValidDateString(endDate)
            ) {
                return res.status(400).send("Invalid date.");
            }

            const {
                startDate: newStartDate,
                endDate: newEndDate
            } = getIndiaDateRange(startDate, endDate);

            if (
                Number.isNaN(newStartDate.getTime()) ||
                Number.isNaN(newEndDate.getTime())
            ) {
                return res.status(400).send("Invalid date.");
            }

            if (newEndDate < newStartDate) {
                return res.status(400).send(
                    "End date cannot be before start date."
                );
            }

            const user = await User.findById(userId)
                .select("_id name email phone");

            if (!user) {
                return res.status(404).send("User not found.");
            }

            const seat = await Seat.findById(seatId)
                .select("_id seatNumber");

            if (!seat) {
                return res.status(404).send("Seat not found.");
            }

            // ========================================
            // CHECK SEAT CONFLICT
            // ========================================

            const conflict = await findBookingConflict({
                seatId,
                bookingType,
                startDate: newStartDate,
                endDate: newEndDate
            });

            if (conflict) {
                return res.status(409).send(
                    `Seat conflict: booking ${conflict.bookingNumber} overlaps these dates.`
                );
            }

            // ========================================
            // GET PRICE
            // ========================================

            const pricing = await Pricing.findOne({
                type: bookingType
            }).lean();

            // Default prices are used when no custom price is saved.
            const defaultPrices = {
                day: 500,
                night: 300,
                fullDay: 650
            };

            const pricePerMonth = pricing
                ? Number(pricing.price)
                : defaultPrices[bookingType];

            if (
                !Number.isFinite(pricePerMonth) ||
                pricePerMonth < 1
            ) {
                return res.status(400).send(
                    "Invalid booking price."
                );
            }

            // ========================================
            // DURATION AND TOTAL
            // ========================================

            const durationDays = calculateDurationDays(
                newStartDate,
                newEndDate
            );

            const totalAmount = Math.max(
                1,
                Math.round((pricePerMonth / 30) * durationDays)
            );

            const durationMonths = Math.max(
                1,
                Math.ceil(durationDays / 30)
            );

            // ========================================
            // PAYMENT DETAILS
            // ========================================

            let paymentStatus = requestedPaymentStatus;
            let paymentMethod = requestedPaymentMethod;

            // Missing amountPaid defaults to 0.
            const amountPaidInput = req.body.amountPaid;

            let amountPaid =
                amountPaidInput === undefined ||
                amountPaidInput === null ||
                amountPaidInput === ""
                    ? 0
                    : Number(amountPaidInput);

            if (!Number.isFinite(amountPaid) || amountPaid < 0) {
                return res.status(400).send(
                    "Please enter a valid amount paid."
                );
            }

            if (amountPaid > totalAmount) {
                return res.status(400).send(
                    "Amount paid cannot exceed the booking total."
                );
            }

            const allowedPaymentMethods = [
                "cash",
                "upi",
                "bank_transfer",
                "complimentary",
                "other"
            ];

            if (paymentStatus === "paid") {
                if (!allowedPaymentMethods.includes(paymentMethod)) {
                    return res.status(400).send(
                        "Select a valid manual payment method."
                    );
                }

                if (paymentMethod === "complimentary") {
                    amountPaid = 0;
                } else if (amountPaid < totalAmount) {
                    return res.status(400).send(
                        "For a paid booking, amount received must cover the full booking amount."
                    );
                }
            } else {
                // Never mark an unpaid booking as paid.
                if (paymentMethod === "complimentary") {
                    return res.status(400).send(
                        "Complimentary bookings must be marked paid with zero amount."
                    );
                }

                if (amountPaid > 0) {
                    return res.status(400).send(
                        "This form records either full payment or unpaid status. Select Paid if the full amount was received."
                    );
                }

                paymentMethod = "";
                amountPaid = 0;
            }

            let paymentReceivedAt = null;

            if (paymentStatus === "paid") {
                if (paymentMethod === "complimentary") {
                    paymentReceivedAt = new Date();
                } else if (req.body.paymentReceivedAt) {
                    const suppliedDate = new Date(
                        req.body.paymentReceivedAt
                    );

                    if (Number.isNaN(suppliedDate.getTime())) {
                        return res.status(400).send(
                            "Invalid payment received date."
                        );
                    }

                    paymentReceivedAt = suppliedDate;
                } else {
                    paymentReceivedAt = new Date();
                }
            }

            // ========================================
            // BOOKING NUMBER
            // ========================================

            const bookingNumber =
                "KVK-ADM-" +
                Date.now() +
                "-" +
                crypto.randomBytes(4)
                    .toString("hex")
                    .toUpperCase();

            // ========================================
            // CREATE MANUAL BOOKING
            // ========================================

            const bookingData = {
                bookingNumber,
                user: user._id,
                seat: seat._id,
                bookingType,
                startDate: newStartDate,
                endDate: newEndDate,
                durationDays,
                durationMonths,
                pricePerMonth,
                totalAmount,

                // Manual assignments don't need online approval.
                approvalStatus: "not_required",

                // Seat assigned; payment can still be pending.
                status: "confirmed",

                paymentStatus,
                amountPaid,

                paymentNotes,
                paymentReference
            };

            if (paymentStatus === "paid") {
                bookingData.paymentMethod = paymentMethod;
                bookingData.paymentReceivedAt = paymentReceivedAt;
                bookingData.paymentReceivedBy = req.session.userId;
            }

            const booking = new Booking(bookingData);

            await booking.save();

            return res.redirect("/admin");
        } catch (err) {
            if (err && err.code === 11000) {
                return res.status(409).send(
                    "Booking number already exists. Please try again."
                );
            }

            console.error("Admin seat assignment error:", err);

            return res.status(500).send(
                "Unable to assign seat."
            );
        }
    }
);

// ========================================
// APPROVE ONLINE BOOKING
// POST /admin/bookings/:id/approve
// ========================================

router.post(
    "/bookings/:id/approve",
    isAdmin,
    async (req, res) => {
        try {
            const bookingId = req.params.id;

            if (!mongoose.Types.ObjectId.isValid(bookingId)) {
                return res.status(400).send(
                    "Invalid booking ID."
                );
            }

            const booking = await Booking.findById(bookingId);

            if (!booking) {
                return res.status(404).send(
                    "Booking not found."
                );
            }

            if (booking.status === "cancelled") {
                return res.status(400).send(
                    "A cancelled booking cannot be approved."
                );
            }

            if (booking.paymentStatus === "paid") {
                return res.status(400).send(
                    "This booking is already paid."
                );
            }

            // Older confirmed bookings aren't new requests.
            if (
                booking.approvalStatus === "not_required" ||
                (
                    !booking.approvalStatus &&
                    booking.status === "confirmed"
                )
            ) {
                return res.status(400).send(
                    "This booking does not require approval."
                );
            }

            if (booking.approvalStatus === "rejected") {
                return res.status(400).send(
                    "A rejected booking cannot be approved."
                );
            }

            if (booking.approvalStatus === "approved") {
                return res.redirect("/admin");
            }

            if (!booking.seat || !booking.startDate || !booking.endDate) {
                return res.status(400).send(
                    "Booking is missing seat or date information."
                );
            }

            // Recheck availability before approval.
            const conflict = await findBookingConflict({
                seatId: booking.seat,
                bookingType: booking.bookingType || "fullDay",
                startDate: booking.startDate,
                endDate: booking.endDate,
                excludeBookingId: booking._id
            });

            if (conflict) {
                return res.status(409).send(
                    `Cannot approve: seat conflicts with booking ${conflict.bookingNumber}.`
                );
            }

            booking.approvalStatus = "approved";
            booking.approvedBy = req.session.userId;
            booking.approvedAt = new Date();

            // Payment stays pending until the student pays.
            booking.paymentStatus = "pending";

            await booking.save();

            return res.redirect("/admin");
        } catch (err) {
            console.error("Booking approval error:", err);

            return res.status(500).send(
                "Unable to approve booking."
            );
        }
    }
);

// ========================================
// REJECT ONLINE BOOKING
// POST /admin/bookings/:id/reject
// ========================================

router.post(
    "/bookings/:id/reject",
    isAdmin,
    async (req, res) => {
        try {
            const bookingId = req.params.id;

            if (!mongoose.Types.ObjectId.isValid(bookingId)) {
                return res.status(400).send(
                    "Invalid booking ID."
                );
            }

            const booking = await Booking.findById(bookingId);

            if (!booking) {
                return res.status(404).send(
                    "Booking not found."
                );
            }

            if (booking.status === "cancelled") {
                return res.redirect("/admin");
            }

            if (booking.paymentStatus === "paid") {
                return res.status(400).send(
                    "A paid booking cannot be rejected here. Handle cancellation and any refund separately."
                );
            }

            if (
                booking.approvalStatus === "not_required" ||
                (
                    !booking.approvalStatus &&
                    booking.status === "confirmed"
                )
            ) {
                return res.status(400).send(
                    "This booking is not an online approval request."
                );
            }

            booking.approvalStatus = "rejected";
            booking.rejectedAt = new Date();

            booking.rejectionReason =
                typeof req.body.rejectionReason === "string"
                    ? req.body.rejectionReason.trim()
                    : "";

            booking.status = "cancelled";

            booking.cancelledAt = new Date();
            booking.cancelledBy = req.session.userId;

            booking.cancellationReason =
                booking.rejectionReason || "Rejected by admin";

            await booking.save();

            return res.redirect("/admin");
        } catch (err) {
            console.error("Booking rejection error:", err);

            return res.status(500).send(
                "Unable to reject booking."
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
            const bookingId = req.params.id;

            if (!mongoose.Types.ObjectId.isValid(bookingId)) {
                return res.status(400).send(
                    "Invalid booking ID."
                );
            }

            const booking = await Booking.findById(bookingId);

            if (!booking) {
                return res.status(404).send(
                    "Booking not found."
                );
            }

            if (booking.status === "cancelled") {
                return res.redirect("/admin");
            }

            if (booking.paymentStatus === "paid") {
                console.log(
                    `Paid booking ${booking.bookingNumber} cancelled by admin. Any refund must be handled separately.`
                );
            }

            booking.status = "cancelled";
            booking.cancelledAt = new Date();
            booking.cancelledBy = req.session.userId;

            booking.cancellationReason =
                typeof req.body.cancellationReason === "string"
                    ? req.body.cancellationReason.trim()
                    : "Cancelled by admin";

            await booking.save();

            return res.redirect("/admin");
        } catch (err) {
            console.error("Booking cancellation error:", err);

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
            const bookings = await Booking.find()
                .populate({
                    path: "user",
                    select: "name email phone role isVerified isEmailVerified"
                })
                .populate({
                    path: "seat",
                    select: "seatNumber"
                })
                .sort({ createdAt: -1 });

            return res.render("admin/bookings", {
                bookings
            });
        } catch (err) {
            console.error("Admin bookings error:", err);

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
            const users = await User.find()
                .select("-password")
                .sort({ createdAt: -1 });

            return res.render("admin/users", {
                users
            });
        } catch (err) {
            console.error("Admin users error:", err);

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
            const seats = await Seat.find()
                .sort({ seatNumber: 1 });

            return res.render("admin/seats", {
                seats
            });
        } catch (err) {
            console.error("Admin seats error:", err);

            return res.status(500).send(
                "Unable to load seats."
            );
        }
    }
);

// ========================================
// MULTER ERROR HANDLER
// ========================================

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
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
        err.message.includes("Only JPG")
    ) {
        return res.status(400).send(err.message);
    }

    return next(err);
});

// ========================================
// DELETE ALL BOOKINGS
// ========================================
router.post("/bookings/delete-all", isAdmin, async (req, res) => {
  try {
    await Booking.deleteMany({});
    return res.redirect("/admin");
  } catch (error) {
    console.error("Delete bookings error:", error);
    return res.status(500).send("Delete failed");
  }
});



// ========================================
// EXPORT ALL BOOKINGS TO PDF
// GET /admin/bookings/export-pdf
// ========================================

router.get(
    "/bookings/export-pdf",
    isAdmin,
    async (req, res) => {
        try {
            const PDFDocument = require("pdfkit");

            const bookings = await Booking.find()
                .populate("user")
                .populate("seat")
                .sort({ createdAt: 1 })
                .lean();

            const fileName =
                `KAVIKA-Bookings-${new Date().toISOString().slice(0, 10)}.pdf`;

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${fileName}"`
            );

            const doc = new PDFDocument({
                size: "A4",
                margin: 40,
                bufferPages: true
            });

            doc.on("error", (err) => {
                console.error("PDF stream error:", err);
                if (!res.destroyed) res.destroy(err);
            });

            doc.pipe(res);

            doc.fontSize(20)
                .text("KAVIKA LIBRARY", { align: "center" });

            doc.moveDown(0.5);

            doc.fontSize(14)
                .text("Complete Booking Backup", { align: "center" });

            doc.moveDown();

            doc.fontSize(10)
                .text(`Total bookings: ${bookings.length}`)
                .text(
                    `Generated: ${new Date().toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata"
                    })}`
                );

            doc.moveDown();

            const printField = (label, value) => {
                const textValue =
                    value === undefined || value === null || value === ""
                        ? "N/A"
                        : value instanceof Date
                            ? value.toISOString()
                            : String(value);

                doc.fontSize(9).text(`${label}: ${textValue}`, {
                    width: 510
                });
            };

            for (let i = 0; i < bookings.length; i++) {
                const b = bookings[i];

                // Keep each booking section together as much as possible.
                if (doc.y > 650) doc.addPage();

                doc.moveDown(0.5);

                doc.fontSize(12).text(`BOOKING ${i + 1}`, {
                    underline: true
                });

                doc.moveDown(0.3);

                printField("Database ID", b._id);
                printField("Booking Number", b.bookingNumber);
                printField("User ID", b.user?._id);
                printField("User Name", b.user?.name);
                printField("User Email", b.user?.email);
                printField("User Phone", b.user?.phone);
                printField("Seat ID", b.seat?._id);
                printField("Seat Number", b.seat?.seatNumber);
                printField("Booking Type", b.bookingType);
                printField("Start Date", b.startDate);
                printField("End Date", b.endDate);
                printField("Duration Days", b.durationDays);
                printField("Duration Months", b.durationMonths);
                printField("Price Per Month", b.pricePerMonth);
                printField("Total Amount", b.totalAmount);
                printField("Amount Paid", b.amountPaid);
                printField(
                    "Remaining Amount",
                    Math.max(
                        0,
                        Number(b.totalAmount || 0) -
                        Number(b.amountPaid || 0)
                    )
                );
                printField("Status", b.status);
                printField("Approval Status", b.approvalStatus);
                printField("Approved By", b.approvedBy);
                printField("Approved At", b.approvedAt);
                printField("Rejected At", b.rejectedAt);
                printField("Rejection Reason", b.rejectionReason);
                printField("Payment Status", b.paymentStatus);
                printField("Payment Method", b.paymentMethod);
                printField("Payment Received At", b.paymentReceivedAt);
                printField("Payment Received By", b.paymentReceivedBy);
                printField("Payment Reference", b.paymentReference);
                printField("Payment Notes", b.paymentNotes);
                printField("Razorpay Order ID", b.razorpayOrderId);
                printField("Razorpay Payment ID", b.razorpayPaymentId);
                printField("Razorpay Signature", b.razorpaySignature);
                printField("Is Renewal", b.isRenewal);
                printField("Renewed From", b.renewedFrom);
                printField("Receipt Number", b.receiptNumber);
                printField("Receipt Generated At", b.receiptGeneratedAt);
                printField(
                    "WhatsApp Confirmation Sent",
                    b.whatsappConfirmationSent
                );
                printField(
                    "WhatsApp Confirmation Sent At",
                    b.whatsappConfirmationSentAt
                );
                printField(
                    "7-Day Expiry Reminder",
                    b.expiryReminder7DaysSentAt
                );
                printField(
                    "3-Day Expiry Reminder",
                    b.expiryReminder3DaysSentAt
                );
                printField(
                    "1-Day Expiry Reminder",
                    b.expiryReminder1DaySentAt
                );
                printField("Cancelled At", b.cancelledAt);
                printField("Cancelled By", b.cancelledBy);
                printField("Cancellation Reason", b.cancellationReason);
                printField("Created At", b.createdAt);
                printField("Updated At", b.updatedAt);

                doc.moveDown(0.5);
                doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
                doc.moveDown(0.5);
            }

            doc.end();
        } catch (err) {
            console.error("Booking PDF export error:", err);

            if (!res.headersSent) {
                return res.status(500).send(
                    "Unable to generate bookings PDF. Check the server terminal."
                );
            }

            if (!res.destroyed) res.destroy(err);
        }
    }
);


// ========================================
// EXPORT
// ========================================

module.exports = router;