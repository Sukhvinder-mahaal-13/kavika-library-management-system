
const mongoose = require("mongoose");

// ========================================
// HOME IMAGE SCHEMA
// ========================================

const homeImageSchema = new mongoose.Schema(
    {
        // ========================================
        // IMAGE TYPE
        // ========================================

        type: {
            type: String,
            required: true,
            enum: ["hero", "about"],
            trim: true,
            unique: true
        },

        // ========================================
        // IMAGE PATH
        // ========================================

        image: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500
        }
    },
    {
        timestamps: true
    }
);

// ========================================
// INDEX
// ========================================

// Only one document for each type:
// hero  -> one image
// about -> one image

homeImageSchema.index(
    { type: 1 },
    { unique: true }
);

// ========================================
// MODEL
// ========================================

const HomeImage = mongoose.model(
    "HomeImage",
    homeImageSchema
);

module.exports = HomeImage;

