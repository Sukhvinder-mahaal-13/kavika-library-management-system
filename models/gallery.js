
const mongoose = require("mongoose");

// ========================================
// GALLERY SCHEMA
// ========================================

const gallerySchema = new mongoose.Schema(
    {
        // ========================================
        // IMAGE
        // ========================================

        image: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500
        },

        // ========================================
        // TITLE
        // ========================================

        title: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 150
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

// Newest gallery images first

gallerySchema.index({
    createdAt: -1
});

// ========================================
// MODEL
// ========================================

const Gallery = mongoose.model(
    "Gallery",
    gallerySchema
);

// ========================================
// EXPORT
// ========================================

module.exports = Gallery;

