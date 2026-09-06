
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

    const keyId =
        process.env.RAZORPAY_KEY_ID;

    const keySecret =
        process.env.RAZORPAY_KEY_SECRET;


    if (!keyId || !keySecret) {

        throw new Error(
            "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing."
        );

    }


    return new Razorpay({

        key_id:
            keyId.trim(),

        key_secret:
            keySecret.trim()

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
// BOOKING TYPE LABEL
// ======================================================

function getBookingTypeLabel(type) {

    const labels = {

        day: "Day",

        night: "Night",

        fullDay: "Day + Night"

    };


    return labels[type] || type;

}


// ======================================================
// CALCULATE DAYS
// ======================================================

function calculateDays(startDate, endDate) {

    const millisecondsPerDay =
        1000 * 60 * 60 * 24;


    return (
        Math.floor(
            (
                endDate.getTime() -
                startDate.getTime()
            ) /
            millisecondsPerDay
        ) + 1
    );

}


// ======================================================
// CHECK BOOKING TYPE CONFLICT
// ======================================================

function hasBookingTypeConflict(
    existingType,
    newType
) {

    // Full day conflicts with everything.

    if (
        existingType === "fullDay" ||
        newType === "fullDay"
    ) {

        return true;

    }


    // Same type cannot coexist.

    if (
        existingType === newType
    ) {

        return true;

    }


    // Day + Night can coexist.

    return false;

}


// ======================================================
// FIND OVERLAPPING CONFIRMED BOOKINGS
// ======================================================

async function findOverlappingBookings({
    seat,
    startDate,
    endDate,
    excludeBookingId = null
}) {

    const query = {

        seat,

        status: "confirmed",

        startDate: {
            $lte: endDate
        },

        endDate: {
            $gte: startDate
        }

    };


    if (excludeBookingId) {

        query._id = {
            $ne: excludeBookingId
        };

    }


    return Booking.find(query);

}


// ======================================================
// MY BOOKINGS
// GET /bookings/my
// ======================================================

router.get(
    "/my",
    async (req, res) => {

        try {

            if (!requireLogin(req, res)) {
                return;
            }


            const bookings =
                await Booking.find({

                    user:
                        req.session.userId

                })
                .populate("seat")
                .sort({

                    startDate: -1

                });


            return res.render(
                "bookings/my",
                {

                    bookings

                }
            );


        } catch (err) {

            console.error(
                "My bookings error:",
                err
            );


            return res.status(500).send(
                "Something went wrong."
            );

        }

    }
);


// ======================================================
// NEW BOOKING PAGE
// GET /bookings/new
// ======================================================

router.get(
    "/new",
    async (req, res) => {

        try {

            if (!requireLogin(req, res)) {
                return;
            }


            const seats =
                await Seat.find()
                    .sort({

                        seatNumber: 1

                    });


            const pricing =
                await Pricing.find();


            return res.render(
                "bookings/new",
                {

                    seats,

                    seat: null,

                    pricing

                }
            );


        } catch (err) {

            console.error(
                "Booking page error:",
                err
            );


            return res.status(500).send(
                "Something went wrong."
            );

        }

    }
);


// ======================================================
// BOOKING CONFIRMATION
// GET /bookings/confirmation/:id
// ======================================================

router.get(
    "/confirmation/:id",
    async (req, res) => {

        try {

            if (!requireLogin(req, res)) {
                return;
            }


            const booking =
                await Booking.findOne({

                    _id:
                        req.params.id,

                    user:
                        req.session.userId

                })
                .populate("seat")
                .populate("user");


            if (!booking) {

                return res.status(404).send(
                    "Booking not found!"
                );

            }


            return res.render(
                "bookings/confirmation",
                {

                    booking,

                    razorpayKeyId:
                        process.env.RAZORPAY_KEY_ID

                }
            );


        } catch (err) {

            console.error(
                "Confirmation error:",
                err
            );


            return res.status(500).send(
                "Something went wrong."
            );

        }

    }
);


// ======================================================
// BOOK SPECIFIC SEAT
// GET /bookings/:seatId
// ======================================================

router.get(
    "/:seatId",
    async (req, res) => {

        try {

            if (!requireLogin(req, res)) {
                return;
            }


            const seat =
                await Seat.findById(
                    req.params.seatId
                );


            if (!seat) {

                return res.status(404).send(
                    "Seat not found!"
                );

            }


            const pricing =
                await Pricing.find();


            return res.render(
                "bookings/new",
                {

                    seats: [],

                    seat,

                    pricing

                }
            );


        } catch (err) {

            console.error(
                "Specific seat error:",
                err
            );


            return res.status(500).send(
                "Something went wrong."
            );

        }

    }
);


// ======================================================
// CREATE BOOKING + RAZORPAY ORDER
// POST /bookings
// ======================================================

router.post(
    "/",
    async (req, res) => {

        let booking = null;


        try {

            // ==================================================
            // LOGIN
            // ==================================================

            if (
                !req.session ||
                !req.session.userId
            ) {

                return res.redirect(
                    "/users/login"
                );

            }


            // ==================================================
            // RAZORPAY KEYS
            // ==================================================

            const keyId =
                process.env.RAZORPAY_KEY_ID;

            const keySecret =
                process.env.RAZORPAY_KEY_SECRET;


            if (
                !keyId ||
                !keySecret
            ) {

                console.error(
                    "Razorpay keys are missing."
                );


                return res.status(500).send(
                    "Payment system is not configured."
                );

            }


            // ==================================================
            // FORM DATA
            // ==================================================

            const {
                seat,
                bookingType,
                startDate,
                endDate
            } = req.body;


            // ==================================================
            // REQUIRED FIELDS
            // ==================================================

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


            // ==================================================
            // ALLOWED BOOKING TYPES
            // ==================================================

            const allowedTypes = [

                "day",
                "night",
                "fullDay"

            ];


            if (
                !allowedTypes.includes(
                    bookingType
                )
            ) {

                return res.status(400).send(
                    "Invalid booking type."
                );

            }


            // ==================================================
            // DATE PARSING
            // ==================================================

            const newStartDate =
                new Date(
                    `${startDate}T00:00:00`
                );


            const newEndDate =
                new Date(
                    `${endDate}T00:00:00`
                );


            if (
                Number.isNaN(
                    newStartDate.getTime()
                ) ||
                Number.isNaN(
                    newEndDate.getTime()
                )
            ) {

                return res.status(400).send(
                    "Please enter valid dates."
                );

            }


            // ==================================================
            // NORMALIZE DATES
            // ==================================================

            newStartDate.setHours(
                0,
                0,
                0,
                0
            );


            newEndDate.setHours(
                0,
                0,
                0,
                0
            );


            // ==================================================
            // TODAY
            // ==================================================

            const today =
                new Date();


            today.setHours(
                0,
                0,
                0,
                0
            );


            // ==================================================
            // PAST DATE CHECK
            // ==================================================

            if (
                newStartDate < today
            ) {

                return res.status(400).send(
                    "You cannot book a past date."
                );

            }


            // ==================================================
            // END DATE CHECK
            // ==================================================

            if (
                newEndDate < newStartDate
            ) {

                return res.status(400).send(
                    "End date cannot be before start date."
                );

            }


            // ==================================================
            // FIND SEAT
            // ==================================================

            const seatExists =
                await Seat.findById(
                    seat
                );


            if (!seatExists) {

                return res.status(404).send(
                    "Seat not found."
                );

            }


            // ==================================================
            // CHECK CONFIRMED BOOKINGS
            // ==================================================

            const overlappingBookings =
                await findOverlappingBookings({

                    seat,

                    startDate:
                        newStartDate,

                    endDate:
                        newEndDate

                });


            // ==================================================
            // CHECK BOOKING TYPE CONFLICT
            // ==================================================

            const conflict =
                overlappingBookings.find(
                    existingBooking => {

                        return hasBookingTypeConflict(

                            existingBooking.bookingType,

                            bookingType

                        );

                    }
                );


            if (conflict) {

                return res.status(409).send(

                    `Seat is already booked from ${
                        conflict.startDate.toLocaleDateString("en-IN")
                    } to ${
                        conflict.endDate.toLocaleDateString("en-IN")
                    } for this booking type.`

                );

            }


            // ==================================================
            // GET PRICE
            // ==================================================

            const pricing =
                await Pricing.findOne({

                    type:
                        bookingType

                });


            if (!pricing) {

                return res.status(400).send(

                    `Price for ${
                        getBookingTypeLabel(
                            bookingType
                        )
                    } has not been set by admin.`

                );

            }


            // ==================================================
            // PRICE PER MONTH
            // ==================================================

            const pricePerMonth =
                Number(
                    pricing.price
                );


            if (
                !Number.isFinite(
                    pricePerMonth
                ) ||
                pricePerMonth <= 0
            ) {

                return res.status(400).send(
                    "Invalid price set by admin."
                );

            }


            // ==================================================
            // DURATION
            // ==================================================

            const durationDays =
                calculateDays(
                    newStartDate,
                    newEndDate
                );


            if (
                !Number.isInteger(
                    durationDays
                ) ||
                durationDays < 1
            ) {

                return res.status(400).send(
                    "Invalid booking duration."
                );

            }


            // ==================================================
            // PRICE PER DAY
            // ==================================================

            const pricePerDay =
                pricePerMonth / 30;


            // ==================================================
            // TOTAL AMOUNT
            // ==================================================

            const totalAmount =
                Math.round(
                    pricePerDay *
                    durationDays
                );


            if (
                !Number.isSafeInteger(
                    totalAmount
                ) ||
                totalAmount <= 0
            ) {

                return res.status(400).send(
                    "Invalid payment amount."
                );

            }


            // ==================================================
            // DURATION MONTHS
            // ==================================================

            const durationMonths =
                Math.floor(
                    durationDays / 30
                );


            // ==================================================
            // BOOKING NUMBER
            // ======================================================

            const bookingNumber =
                `KVK-${Date.now()}-${Math.floor(
                    Math.random() * 100000
                )}`;


            // ==================================================
            // CREATE PENDING BOOKING
            // ==================================================

            booking =
                new Booking({

                    bookingNumber,

                    user:
                        req.session.userId,

                    seat,

                    bookingType,

                    startDate:
                        newStartDate,

                    endDate:
                        newEndDate,

                    durationDays,

                    durationMonths,

                    pricePerMonth,

                    totalAmount,

                    paymentStatus:
                        "pending",

                    status:
                        "pending"

                });


            await booking.save();


            console.log(
                "Pending booking created:",
                booking.bookingNumber
            );


            // ==================================================
            // CREATE RAZORPAY
            // ==================================================

            const razorpay =
                getRazorpay();


            let razorpayOrder;


            try {

                razorpayOrder =
                    await razorpay.orders.create({

                        amount:
                            Math.round(
                                totalAmount * 100
                            ),

                        currency:
                            "INR",

                        receipt:
                            booking.bookingNumber,

                        notes: {

                            bookingId:
                                booking._id.toString(),

                            bookingNumber:
                                booking.bookingNumber,

                            seatId:
                                seat.toString(),

                            userId:
                                req.session.userId.toString()

                        }

                    });


            } catch (razorpayError) {

                console.error(
                    "Razorpay order creation error:",
                    razorpayError
                );


                booking.status =
                    "cancelled";


                booking.paymentStatus =
                    "failed";


                await booking.save();


                const razorpayMessage =
                    razorpayError?.error?.description ||
                    razorpayError?.message ||
                    "Unable to create Razorpay order.";


                return res.status(500).send(
                    `Unable to create Razorpay order: ${razorpayMessage}`
                );

            }


            // ==================================================
            // CHECK RAZORPAY ORDER
            // ==================================================

            if (
                !razorpayOrder ||
                !razorpayOrder.id
            ) {

                booking.status =
                    "cancelled";


                booking.paymentStatus =
                    "failed";


                await booking.save();


                return res.status(500).send(
                    "Razorpay order was not created."
                );

            }


            // ==================================================
            // SAVE RAZORPAY ORDER ID
            // ==================================================

            booking.razorpayOrderId =
                razorpayOrder.id;


            await booking.save();


            console.log(
                "Razorpay order created:",
                razorpayOrder.id
            );


            // ==================================================
            // REDIRECT TO CONFIRMATION PAGE
            // ==================================================

            return res.redirect(
                `/bookings/confirmation/${booking._id}`
            );


        } catch (err) {

            console.error(
                "Create booking/payment error:",
                err
            );


            // ==================================================
            // CANCEL FAILED BOOKING
            // ==================================================

            if (booking) {

                try {

                    // Only cancel if payment hasn't
                    // already been successfully completed.

                    if (
                        booking.paymentStatus !==
                        "paid"
                    ) {

                        booking.status =
                            "cancelled";

                        booking.paymentStatus =
                            "failed";

                        await booking.save();

                    }

                } catch (saveError) {

                    console.error(
                        "Could not cancel failed booking:",
                        saveError
                    );

                }

            }


            // ==================================================
            // DUPLICATE BOOKING NUMBER
            // ==================================================

            if (
                err.code === 11000
            ) {

                return res.status(500).send(
                    "Booking number conflict. Please try again."
                );

            }


            // ==================================================
            // GENERAL ERROR
            // ==================================================

            return res.status(500).send(

                err.message ||
                "Booking failed. Please try again."

            );

        }

    }
);


// ======================================================
// VERIFY RAZORPAY PAYMENT
// POST /bookings/payment/verify
// ======================================================

router.post(
    "/payment/verify",
    async (req, res) => {

        try {

            // ==================================================
            // LOGIN
            // ==================================================

            if (
                !req.session ||
                !req.session.userId
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Please login first."

                });

            }


            // ==================================================
            // RAZORPAY
            // ==================================================

            const razorpay =
                getRazorpay();


            // ==================================================
            // FORM DATA
            // ==================================================

            const {
                bookingId,
                razorpayPaymentId,
                razorpayOrderId,
                razorpaySignature
            } = req.body;


            // ==================================================
            // VALIDATE PAYMENT DATA
            // ==================================================

            if (
                !bookingId ||
                !razorpayPaymentId ||
                !razorpayOrderId ||
                !razorpaySignature
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment verification data is incomplete."

                });

            }


            // ==================================================
            // FIND BOOKING
            // ==================================================

            const booking =
                await Booking.findOne({

                    _id:
                        bookingId,

                    user:
                        req.session.userId

                });


            if (!booking) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Booking not found."

                });

            }


            // ==================================================
            // ALREADY SUCCESSFULLY PAID
            // ==================================================

            if (
                booking.paymentStatus === "paid" &&
                booking.status === "confirmed"
            ) {

                return res.json({

                    success: true,

                    message:
                        "Payment already verified.",

                    redirect:
                        `/bookings/confirmation/${booking._id}`

                });

            }


            // ==================================================
            // CANCELLED BOOKING PROTECTION
            // ==================================================
            //
            // A cancelled booking must NOT become confirmed
            // later if the old Razorpay payment completes.
            //
            // ==================================================

            if (
                booking.status === "cancelled"
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "This booking has already been cancelled. Please create a new booking."

                });

            }


            // ==================================================
            // ORDER ID MUST EXIST
            // ==================================================

            if (
                !booking.razorpayOrderId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Razorpay order not found."

                });

            }


            // ==================================================
            // ORDER ID MATCH
            // ==================================================

            if (
                booking.razorpayOrderId !==
                razorpayOrderId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid Razorpay order."

                });

            }


            // ==================================================
            // RAZORPAY SECRET
            // ==================================================

            const keySecret =
                process.env.RAZORPAY_KEY_SECRET;


            if (!keySecret) {

                throw new Error(
                    "RAZORPAY_KEY_SECRET is missing."
                );

            }


            // ==================================================
            // GENERATE SIGNATURE
            // ==================================================

            const generatedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        keySecret.trim()
                    )
                    .update(
                        `${booking.razorpayOrderId}|${razorpayPaymentId}`
                    )
                    .digest("hex");


            // ==================================================
            // SIGNATURE LENGTH
            // ==================================================

            if (
                generatedSignature.length !==
                razorpaySignature.length
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment verification failed."

                });

            }


            // ==================================================
            // SAFE SIGNATURE COMPARISON
            // ==================================================

            const signaturesMatch =
                crypto.timingSafeEqual(

                    Buffer.from(
                        generatedSignature,
                        "utf8"
                    ),

                    Buffer.from(
                        razorpaySignature,
                        "utf8"
                    )

                );


            if (!signaturesMatch) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment verification failed."

                });

            }


            // ==================================================
            // FETCH PAYMENT FROM RAZORPAY
            // ==================================================

            const payment =
                await razorpay.payments.fetch(
                    razorpayPaymentId
                );


            if (!payment) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Unable to verify payment."

                });

            }


            // ==================================================
            // CHECK PAYMENT ORDER
            // ==================================================

            if (
                payment.order_id !==
                booking.razorpayOrderId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment order mismatch."

                });

            }


            // ==================================================
            // CHECK PAYMENT AMOUNT
            // ==================================================

            const expectedAmount =
                Math.round(
                    Number(
                        booking.totalAmount
                    ) * 100
                );


            if (
                Number(payment.amount) !==
                expectedAmount
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment amount mismatch."

                });

            }


            // ==================================================
            // CHECK PAYMENT STATUS
            // ==================================================

            if (
                payment.status !==
                "captured"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment has not been captured yet."

                });

            }


            // ==================================================
            // FINAL SEAT AVAILABILITY CHECK
            // ======================================================

            const latestBookings =
                await findOverlappingBookings({

                    seat:
                        booking.seat,

                    startDate:
                        booking.startDate,

                    endDate:
                        booking.endDate,

                    excludeBookingId:
                        booking._id

                });


            // ==================================================
            // FINAL CONFLICT
            // ==================================================

            const finalConflict =
                latestBookings.find(
                    existingBooking => {

                        return hasBookingTypeConflict(

                            existingBooking.bookingType,

                            booking.bookingType

                        );

                    }
                );


            // ==================================================
            // SEAT BECAME UNAVAILABLE
            // ==================================================

            if (finalConflict) {

                booking.paymentStatus =
                    "paid";


                booking.status =
                    "cancelled";


                booking.razorpayPaymentId =
                    razorpayPaymentId;


                booking.razorpaySignature =
                    razorpaySignature;


                await booking.save();


                return res.status(409).json({

                    success: false,

                    paymentReceived:
                        true,

                    message:
                        "Payment was successful, but this seat became unavailable. Please contact the library for refund/settlement."

                });

            }


            // ==================================================
            // SAVE SUCCESSFUL PAYMENT
            // ==================================================

            booking.razorpayPaymentId =
                razorpayPaymentId;


            booking.razorpaySignature =
                razorpaySignature;


            booking.paymentStatus =
                "paid";


            booking.status =
                "confirmed";


            await booking.save();


            console.log(
                "Payment verified successfully:",
                booking.bookingNumber
            );


            // ==================================================
            // SUCCESS
            // ==================================================

            return res.json({

                success: true,

                message:
                    "Payment successful. Seat confirmed!",

                redirect:
                    `/bookings/confirmation/${booking._id}`

            });


        } catch (err) {

            console.error(
                "Payment verification error:",
                err
            );


            return res.status(500).json({

                success: false,

                message:
                    "Payment verification failed. Please contact the library if money was deducted."

            });

        }

    }
);


// ======================================================
// CANCEL BOOKING
// POST /bookings/:id/cancel
// ======================================================

router.post(
    "/:id/cancel",
    async (req, res) => {

        try {

            if (!requireLogin(req, res)) {
                return;
            }


            const booking =
                await Booking.findOne({

                    _id:
                        req.params.id,

                    user:
                        req.session.userId

                });


            if (!booking) {

                return res.status(404).send(
                    "Booking not found!"
                );

            }


            // ==================================================
            // ALREADY CANCELLED
            // ==================================================

            if (
                booking.status ===
                "cancelled"
            ) {

                return res.redirect(
                    "/bookings/my"
                );

            }


            // ==================================================
            // PAID BOOKING
            // ==================================================
            //
            // Paid bookings are not automatically refunded here.
            // Refund policy can be implemented separately.
            //
            // ==================================================

            if (
                booking.paymentStatus ===
                "paid"
            ) {

                return res.status(400).send(
                    "Paid booking cannot be cancelled automatically. Please contact the library for cancellation/refund."
                );

            }


            // ==================================================
            // CANCEL PENDING BOOKING
            // ==================================================

            booking.status =
                "cancelled";


            booking.paymentStatus =
                "failed";


            await booking.save();


            return res.redirect(
                "/bookings/my"
            );


        } catch (err) {

            console.error(
                "Cancel booking error:",
                err
            );


            return res.status(500).send(
                "Unable to cancel booking."
            );

        }

    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;

