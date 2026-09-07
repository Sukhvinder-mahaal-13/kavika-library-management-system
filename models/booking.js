
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

        bookingType: {
            type: String,
            enum: [
                "day",
                "night",
                "fullDay"
            ],
            required: true,
            trim: true,
            index: true
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

        pricePerMonth: {
            type: Number,
            required: true,
            min: 0
        },


        // ========================================
        // TOTAL AMOUNT
        // ========================================

        totalAmount: {
            type: Number,
            required: true,
            min: 1
        },


        // ========================================
        // PAYMENT STATUS
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
// Mongoose 9 compatible.
//
// IMPORTANT:
// Yahan next() use nahi kiya gaya.
// Validation fail hone par Error throw
// kiya ja raha hai.
// ========================================

bookingSchema.pre("validate", function () {

    if (
        this.startDate &&
        this.endDate &&
        this.endDate < this.startDate
    ) {
        throw new Error(
            "End date cannot be before start date."
        );
    }

});


// ========================================
// BOOKING OVERLAP INDEX
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

