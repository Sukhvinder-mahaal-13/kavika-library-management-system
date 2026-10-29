
const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const router = express.Router();

const Booking = require("../models/booking");
const Seat = require("../models/Seat");
const Pricing = require("../models/Pricing");

// ======================================================
// RAZORPAY HELPER
// ======================================================

function getRazorpay() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error(
            "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing."
        );
    }

    return new Razorpay({
        key_id: keyId.trim(),
        key_secret: keySecret.trim()
    });
}

// ======================================================
// LOGIN HELPER
// ======================================================

function requireLogin(req, res) {
    if (!req.session || !req.session.userId) {
        res.redirect("/users/login");
        return false;
    }

    return true;
}

// ======================================================
// BOOKING TYPE HELPERS
// ======================================================

function getBookingTypeLabel(type) {
    const labels = {
        day: "Day",
        night: "Night",
        fullDay: "Day + Night"
    };

    return labels[type] || type;
}

function hasBookingTypeConflict(existingType, newType) {
    existingType = existingType || "fullDay";

    if (existingType === "fullDay" || newType === "fullDay") {
        return true;
    }

    return existingType === newType;
}

// ======================================================
// DATE HELPERS
// ======================================================

function calculateDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return Math.floor(
        (end.getTime() - start.getTime()) / 86400000
    ) + 1;
}

function isValidDateString(value) {
    if (typeof value !== "string") return false;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

// ======================================================
// FIND OVERLAPPING BOOKINGS
// Confirmed bookings and approved unpaid bookings reserve
// the seat/time slot.
// ======================================================

async function findOverlappingBookings({
    seat,
    startDate,
    endDate,
    excludeBookingId = null
}) {
    const query = {
        seat,
        status: { $ne: "cancelled" },
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
        $or: [
            { status: "confirmed" },
            { approvalStatus: "approved" }
        ]
    };

    if (excludeBookingId) {
        query._id = { $ne: excludeBookingId };
    }

    return Booking.find(query);
}

async function hasConflictingBooking({
    seat,
    startDate,
    endDate,
    bookingType,
    excludeBookingId = null
}) {
    const bookings = await findOverlappingBookings({
        seat,
        startDate,
        endDate,
        excludeBookingId
    });

    return bookings.some(booking =>
        hasBookingTypeConflict(
            booking.bookingType,
            bookingType
        )
    );
}

// ======================================================
// GET MY BOOKINGS
// GET /bookings/my
// ======================================================

router.get("/my", async (req, res) => {
    try {
        if (!requireLogin(req, res)) return;

        const bookings = await Booking.find({
            user: req.session.userId
        })
            .populate("seat")
            .sort({ createdAt: -1 });

        return res.render("bookings/my", {
            bookings
        });
    } catch (err) {
        console.error("My bookings error:", err);

        return res.status(500).send(
            "Unable to load your bookings."
        );
    }
});

// ======================================================
// APPROVAL STATUS API
// GET /bookings/my/approval-status
// ======================================================

router.get("/my/approval-status", async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in first."
            });
        }

        const bookings = await Booking.find({
            user: req.session.userId,
            approvalStatus: "approved",
            paymentStatus: { $ne: "paid" },
            status: { $ne: "cancelled" }
        })
            .populate("seat", "seatNumber")
            .select(
                "_id bookingNumber seat bookingType startDate endDate totalAmount approvalStatus paymentStatus status"
            )
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,

            bookings: bookings.map(booking => ({
                id: String(booking._id),
                bookingNumber: booking.bookingNumber,

                seatNumber: booking.seat
                    ? booking.seat.seatNumber
                    : "N/A",

                bookingType: getBookingTypeLabel(
                    booking.bookingType
                ),

                startDate: booking.startDate,
                endDate: booking.endDate,
                totalAmount: booking.totalAmount,
                approvalStatus: booking.approvalStatus,
                paymentStatus: booking.paymentStatus,
                status: booking.status,

                confirmationUrl:
                    `/bookings/confirmation/${booking._id}`
            }))
        });
    } catch (err) {
        console.error("Approval status API error:", err);

        return res.status(500).json({
            success: false,
            message: "Unable to check booking approval."
        });
    }
});

// ======================================================
// NEW BOOKING PAGE
// GET /bookings/new
// ======================================================

router.get("/new", async (req, res) => {
    try {
        if (!requireLogin(req, res)) return;

        const seats = await Seat.find().sort({
            seatNumber: 1
        });

        const pricing = await Pricing.find();

        return res.render("bookings/new", {
            seats,
            seat: null,
            pricing
        });
    } catch (err) {
        console.error("New booking page error:", err);

        return res.status(500).send(
            "Unable to load the booking page."
        );
    }
});

// ======================================================
// BOOKING CONFIRMATION PAGE
// GET /bookings/confirmation/:id
// ======================================================

router.get("/confirmation/:id", async (req, res) => {
    try {
        if (!requireLogin(req, res)) return;

        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.session.userId
        })
            .populate("seat")
            .populate("user", "name email");

        if (!booking) {
            return res.status(404).send(
                "Booking not found."
            );
        }

        return res.render("bookings/confirmation", {
            booking,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        console.error("Confirmation page error:", err);

        return res.status(500).send(
            "Unable to load confirmation page."
        );
    }
});

// ======================================================
// BOOK SPECIFIC SEAT
// GET /bookings/:seatId
// Keep after named GET routes.
// ======================================================

router.get("/:seatId", async (req, res) => {
    try {
        if (!requireLogin(req, res)) return;

        // Do not treat named routes as seat IDs.
        if (
            ["new", "my", "confirmation"].includes(
                req.params.seatId
            )
        ) {
            return res.status(404).send("Page not found.");
        }

        const seat = await Seat.findById(
            req.params.seatId
        );

        if (!seat) {
            return res.status(404).send(
                "Seat not found."
            );
        }

        const pricing = await Pricing.find();

        return res.render("bookings/new", {
            seats: [],
            seat,
            pricing
        });
    } catch (err) {
        console.error("Specific seat error:", err);

        return res.status(500).send(
            "Unable to load this seat."
        );
    }
});

// ======================================================
// CREATE BOOKING REQUEST
// POST /bookings
//
// Creating a request does NOT create a Razorpay order.
// Payment becomes available only after admin approval.
// ======================================================

router.post("/", async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect("/users/login");
        }

        const {
            seat,
            bookingType,
            startDate,
            endDate
        } = req.body;

        if (
            !seat ||
            !bookingType ||
            !startDate ||
            !endDate
        ) {
            return res.status(400).send(
                "Please fill all the fields."
            );
        }

        if (!["day", "night", "fullDay"].includes(bookingType)) {
            return res.status(400).send(
                "Invalid booking type."
            );
        }

        if (
            !isValidDateString(startDate) ||
            !isValidDateString(endDate)
        ) {
            return res.status(400).send(
                "Please enter valid dates."
            );
        }

        const newStartDate = new Date(
            `${startDate}T00:00:00`
        );

        const newEndDate = new Date(
            `${endDate}T00:00:00`
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (newStartDate < today) {
            return res.status(400).send(
                "You cannot book a past date."
            );
        }

        if (newEndDate < newStartDate) {
            return res.status(400).send(
                "End date cannot be before start date."
            );
        }

        const seatExists = await Seat.findById(seat);

        if (!seatExists) {
            return res.status(404).send(
                "Seat not found."
            );
        }

        const conflict = await hasConflictingBooking({
            seat,
            startDate: newStartDate,
            endDate: newEndDate,
            bookingType
        });

        if (conflict) {
            return res.status(409).send(
                "This seat is already booked for the selected dates and booking type."
            );
        }

        // Preserve existing admin-configured pricing.
        const pricing = await Pricing.findOne({
            type: bookingType
        });

        if (!pricing) {
            return res.status(400).send(
                `Price for ${getBookingTypeLabel(bookingType)} has not been configured.`
            );
        }

        const pricePerMonth = Number(pricing.price);

        if (
            !Number.isFinite(pricePerMonth) ||
            pricePerMonth <= 0
        ) {
            return res.status(400).send(
                "Invalid price configured by admin."
            );
        }

        const durationDays = calculateDays(
            newStartDate,
            newEndDate
        );

        const durationMonths = Math.floor(
            durationDays / 30
        );

        // Existing pricing formula preserved.
        const totalAmount = Math.round(
            (pricePerMonth / 30) * durationDays
        );

        if (
            !Number.isSafeInteger(totalAmount) ||
            totalAmount <= 0
        ) {
            return res.status(400).send(
                "Invalid booking amount."
            );
        }

        const bookingNumber =
            `KVK-${Date.now()}-${crypto.randomBytes(3)
                .toString("hex")
                .toUpperCase()}`;

        const booking = new Booking({
            bookingNumber,
            user: req.session.userId,
            seat,
            bookingType,
            startDate: newStartDate,
            endDate: newEndDate,
            durationDays,
            durationMonths,
            pricePerMonth,
            totalAmount,

            approvalStatus: "pending",
            paymentStatus: "pending",
            amountPaid: 0,
            status: "pending"
        });

        await booking.save();

        return res.redirect(
            `/bookings/confirmation/${booking._id}`
        );
    } catch (err) {
        console.error("Create booking error:", err);

        if (err.code === 11000) {
            return res.status(409).send(
                "Booking number conflict. Please try again."
            );
        }

        return res.status(500).send(
            "Booking failed. Please try again."
        );
    }
});

// ======================================================
// CREATE RAZORPAY ORDER
// POST /bookings/:id/payment/order
// Only approved, unpaid bookings can create orders.
// ======================================================

router.post("/:id/payment/order", async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in first."
            });
        }

        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.session.userId
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found."
            });
        }

        if (booking.approvalStatus !== "approved") {
            return res.status(403).json({
                success: false,
                message:
                    "Admin approval is required before payment."
            });
        }

        if (
            booking.status === "cancelled" ||
            booking.paymentStatus === "paid"
        ) {
            return res.status(400).json({
                success: false,
                message: "This booking cannot be paid."
            });
        }

        const amount = Number(booking.totalAmount);

        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking amount."
            });
        }

        const conflict = await hasConflictingBooking({
            seat: booking.seat,
            startDate: booking.startDate,
            endDate: booking.endDate,
            bookingType: booking.bookingType,
            excludeBookingId: booking._id
        });

        if (conflict) {
            booking.status = "cancelled";
            booking.paymentNotes =
                "Booking cancelled because the seat became unavailable before payment.";

            await booking.save();

            return res.status(409).json({
                success: false,
                message:
                    "This seat is no longer available for the selected dates."
            });
        }

        const razorpay = getRazorpay();

        const order = await razorpay.orders.create({
            amount: amount * 100,
            currency: "INR",
            receipt: String(booking._id),
            notes: {
                bookingId: String(booking._id),
                bookingNumber: String(
                    booking.bookingNumber || ""
                ),
                userId: String(booking.user)
            }
        });

        booking.razorpayOrderId = order.id;
        await booking.save();

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            bookingId: String(booking._id)
        });
    } catch (err) {
        console.error("Create Razorpay order error:", err);

        return res.status(500).json({
            success: false,
            message:
                "Unable to create payment order. Please try again."
        });
    }
});

// ======================================================
// VERIFY RAZORPAY PAYMENT
// POST /bookings/:id/payment/verify
// ======================================================

router.post("/:id/payment/verify", async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in first."
            });
        }

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Missing payment verification details."
            });
        }

        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.session.userId
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found."
            });
        }

        if (booking.approvalStatus !== "approved") {
            return res.status(400).json({
                success: false,
                message: "Booking is not approved."
            });
        }

        if (booking.status === "cancelled") {
            return res.status(400).json({
                success: false,
                message: "This booking has been cancelled."
            });
        }

        if (booking.paymentStatus === "paid") {
            return res.status(400).json({
                success: false,
                message:
                    "Payment has already been completed."
            });
        }

        if (
            !booking.razorpayOrderId ||
            String(booking.razorpayOrderId) !==
                String(razorpay_order_id)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid Razorpay order ID."
            });
        }

        const razorpay = getRazorpay();
        const secret = process.env.RAZORPAY_KEY_SECRET.trim();

        const generatedSignature = crypto
            .createHmac("sha256", secret)
            .update(
                `${razorpay_order_id}|${razorpay_payment_id}`
            )
            .digest("hex");

        const receivedBuffer = Buffer.from(
            razorpay_signature,
            "hex"
        );

        const generatedBuffer = Buffer.from(
            generatedSignature,
            "hex"
        );

        if (
            receivedBuffer.length !== generatedBuffer.length ||
            !crypto.timingSafeEqual(
                receivedBuffer,
                generatedBuffer
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Payment signature verification failed."
            });
        }

        // Verify payment directly with Razorpay.
        const payment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        if (
            String(payment.order_id) !==
                String(razorpay_order_id) ||
            payment.currency !== "INR" ||
            Number(payment.amount) !==
                Math.round(Number(booking.totalAmount) * 100) ||
            payment.status !== "captured"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Payment details could not be verified."
            });
        }

        // Final availability check before confirmation.
        const conflict = await hasConflictingBooking({
            seat: booking.seat,
            startDate: booking.startDate,
            endDate: booking.endDate,
            bookingType: booking.bookingType,
            excludeBookingId: booking._id
        });

        if (conflict) {
            booking.status = "cancelled";
            booking.paymentNotes =
                "Payment captured, but a booking conflict was detected. Admin review and refund may be required.";

            await booking.save();

            return res.status(409).json({
                success: false,
                message:
                    "Payment was received, but a booking conflict was detected. Please contact the administrator."
            });
        }

        // Payment verified: confirm booking.
        booking.paymentStatus = "paid";
        booking.status = "confirmed";
        booking.paymentMethod = "razorpay";
        booking.razorpayPaymentId = razorpay_payment_id;
        booking.razorpaySignature = razorpay_signature;
        booking.amountPaid = Number(booking.totalAmount);
        booking.paymentReceivedAt = new Date();

        await booking.save();

        return res.json({
            success: true,
            message: "Payment verified successfully!",
            bookingId: String(booking._id),
            redirectUrl:
                `/bookings/confirmation/${booking._id}`
        });
    } catch (err) {
        console.error("Payment verification error:", err);

        return res.status(500).json({
            success: false,
            message:
                "An error occurred while verifying payment."
        });
    }
});

// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;

