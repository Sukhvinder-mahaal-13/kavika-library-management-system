
const mongoose = require("mongoose");

// ========================================
// BOOKING SCHEMA
// ========================================

const bookingSchema = new mongoose.Schema(
    {

        // ========================================
        // USER
        // ========================================

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },


        // ========================================
        // SEAT
        // ========================================

        seat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seat",
            required: true,
            index: true
        },


        // ========================================
        // BOOKING NUMBER
        // ========================================

        bookingNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },


        // ========================================
        // BOOKING TYPE
        // ========================================
        // day
        // night
        // fullDay
        // ========================================

        bookingType: {
            type: String,
            enum: [
                "day",
                "night",
                "fullDay"
            ],
            required: true,
            trim: true
        },


        // ========================================
        // START DATE
        // ========================================

        startDate: {
            type: Date,
            required: true,
            index: true
        },


        // ========================================
        // END DATE
        // ========================================

        endDate: {
            type: Date,
            required: true,
            index: true
        },


        // ========================================
        // DURATION IN DAYS
        // ========================================

        durationDays: {
            type: Number,
            required: true,
            min: 1
        },


        // ========================================
        // DURATION IN MONTHS
        // ========================================

        durationMonths: {
            type: Number,
            default: 0,
            min: 0
        },


        // ========================================
        // PRICE PER MONTH
        // ========================================
        // Booking create hone ke time ki price
        // yahan permanently save hogi.
        //
        // Future mein admin price change karega
        // to old booking ki price change nahi hogi.
        // ========================================

        pricePerMonth: {
            type: Number,
            required: true,
            min: 0
        },


        // ========================================
        // TOTAL AMOUNT
        // ========================================
        // Razorpay mein isi amount ka payment
        // create hoga.
        // ========================================

        totalAmount: {
            type: Number,
            required: true,
            min: 1
        },


        // ========================================
        // PAYMENT STATUS
        // ========================================
        // pending = payment pending
        // paid    = payment successful
        // failed  = payment failed
        // ========================================

        paymentStatus: {
            type: String,
            enum: [
                "pending",
                "paid",
                "failed"
            ],
            default: "pending",
            index: true
        },


        // ========================================
        // RAZORPAY ORDER ID
        // ========================================

        razorpayOrderId: {
            type: String,
            default: null,
            trim: true
        },


        // ========================================
        // RAZORPAY PAYMENT ID
        // ========================================

        razorpayPaymentId: {
            type: String,
            default: null,
            trim: true
        },


        // ========================================
        // RAZORPAY SIGNATURE
        // ========================================

        razorpaySignature: {
            type: String,
            default: null,
            trim: true
        },


        // ========================================
        // BOOKING STATUS
        // ========================================
        // pending   = payment pending
        // confirmed = payment successful
        // cancelled = booking cancelled
        // ========================================

        status: {
            type: String,
            enum: [
                "pending",
                "confirmed",
                "cancelled"
            ],
            default: "pending",
            index: true
        }

    },

    // ========================================
    // TIMESTAMPS
    // ========================================

    {
        timestamps: true
    }
);


// ========================================
// DATE VALIDATION
// ========================================

bookingSchema.pre("validate", function (next) {

    if (
        this.startDate &&
        this.endDate &&
        this.endDate < this.startDate
    ) {
        return next(
            new Error(
                "End date cannot be before start date."
            )
        );
    }

    next();
});


// ========================================
// INDEX
// ========================================
// Overlapping confirmed bookings ko quickly
// find karne mein MongoDB ko help karega.
// ========================================

bookingSchema.index({
    seat: 1,
    status: 1,
    startDate: 1,
    endDate: 1
});


// ========================================
// USER BOOKING INDEX
// ========================================

bookingSchema.index({
    user: 1,
    createdAt: -1
});


// ========================================
// BOOKING MODEL
// ========================================

const Booking = mongoose.model(
    "Booking",
    bookingSchema
);


// ========================================
// EXPORT
// ========================================

module.exports = Booking;

