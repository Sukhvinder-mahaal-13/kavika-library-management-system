
const mongoose = require("mongoose");

// ========================================
// PRICING SCHEMA
// ========================================

const pricingSchema = new mongoose.Schema(
    {
        // ========================================
        // BOOKING TYPE
        // ========================================
        // day      = Day
        // night    = Night
        // fullDay  = Day + Night
        // ========================================

        type: {
            type: String,
            enum: ["day", "night", "fullDay"],
            required: true,
            unique: true,
            trim: true
        },

        // ========================================
        // PRICE
        // ========================================
        // Monthly price set by admin
        // ========================================

        price: {
            type: Number,
            required: true,
            min: 1,
            max: 1000000
        },

        // ========================================
        // LABEL
        // ========================================
        // Example:
        // Day
        // Night
        // Day + Night
        // ========================================

        label: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 100
        },

        // ========================================
        // TIME
        // ========================================
        // Example:
        // 8:00 AM - 8:00 PM
        // 8:00 PM - 8:00 AM
        // 24 Hours
        // ========================================

        time: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 100
        }
    },

    // ========================================
    // OPTIONS
    // ========================================

    {
        timestamps: true
    }
);

// ========================================
// INDEX
// ========================================

// Only one pricing document per booking type

pricingSchema.index(
    { type: 1 },
    { unique: true }
);

// ========================================
// MODEL
// ========================================

const Pricing = mongoose.model(
    "Pricing",
    pricingSchema
);

// ========================================
// EXPORT
// ========================================

module.exports = Pricing;

