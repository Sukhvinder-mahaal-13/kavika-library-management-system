
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
            enum: ["day", "night", "fullDay"],
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
        // DURATION
        // ========================================

        durationDays: {
            type: Number,
            required: true,
            min: 1
        },

        durationMonths: {
            type: Number,
            default: 0,
            min: 0
        },

        // ========================================
        // PRICING
        // ========================================

        pricePerMonth: {
            type: Number,
            required: true,
            min: 0
        },

        totalAmount: {
            type: Number,
            required: true,
            min: 0
        },

        // ========================================
        // ADMIN APPROVAL
        // ========================================

        approvalStatus: {
            type: String,
            enum: [
                "not_required",
                "pending",
                "approved",
                "rejected"
            ],
            default: "pending",
            index: true
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        approvedAt: {
            type: Date,
            default: null
        },

        rejectedAt: {
            type: Date,
            default: null
        },

        rejectionReason: {
            type: String,
            default: "",
            trim: true
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
        // PAYMENT METHOD
        // ========================================

        paymentMethod: {
            type: String,
            enum: [
                "razorpay",
                "cash",
                "upi",
                "bank_transfer",
                "complimentary",
                "other"
            ],
            default: null
        },

        // Actual amount received

        amountPaid: {
            type: Number,
            default: 0,
            min: 0
        },

        paymentReceivedAt: {
            type: Date,
            default: null
        },

        paymentReceivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        paymentReference: {
            type: String,
            default: "",
            trim: true
        },

        paymentNotes: {
            type: String,
            default: "",
            trim: true
        },

        // ========================================
        // RAZORPAY ORDER
        // ========================================

        razorpayOrderId: {
            type: String,
            default: null,
            trim: true
        },

        // ========================================
        // RAZORPAY PAYMENT
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
        // RENEWAL TRACKING
        // ========================================

        isRenewal: {
            type: Boolean,
            default: false,
            index: true
        },

        renewedFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null
        },

        // ========================================
        // RECEIPT
        // ========================================

        receiptNumber: {
            type: String,
            default: null,
            trim: true
        },

        receiptGeneratedAt: {
            type: Date,
            default: null
        },

        // ========================================
        // WHATSAPP NOTIFICATION TRACKING
        // ========================================

        whatsappConfirmationSent: {
            type: Boolean,
            default: false
        },

        whatsappConfirmationSentAt: {
            type: Date,
            default: null
        },

        expiryReminder7DaysSentAt: {
            type: Date,
            default: null
        },

        expiryReminder3DaysSentAt: {
            type: Date,
            default: null
        },

        expiryReminder1DaySentAt: {
            type: Date,
            default: null
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
        },

        // ========================================
        // CANCELLATION
        // ========================================

        cancelledAt: {
            type: Date,
            default: null
        },

        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        cancellationReason: {
            type: String,
            default: "",
            trim: true
        }
    },
    {
        timestamps: true
    }
);

// ========================================
// DATE VALIDATION
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
// APPROVAL QUEUE INDEX
// ========================================

bookingSchema.index({
    approvalStatus: 1,
    status: 1,
    createdAt: -1
});

// ========================================
// MODEL
// ========================================

const Booking = mongoose.model(
    "Booking",
    bookingSchema
);

// ========================================
// EXPORT
// ========================================

module.exports = Booking;

