
const mongoose = require("mongoose");

// ========================================
// USER SCHEMA
// ========================================

const userSchema = new mongoose.Schema(
    {

        // ========================================
        // NAME
        // ========================================

        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [100, "Name cannot exceed 100 characters"]
        },


        // ========================================
        // EMAIL
        // ========================================

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: [150, "Email cannot exceed 150 characters"],
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                "Please enter a valid email address"
            ]
        },


        // ========================================
        // MOBILE NUMBER
        // ========================================

        phone: {
            type: String,
            required: [true, "Phone number is required"],
            unique: true,
            trim: true,
            match: [
                /^[6-9]\d{9}$/,
                "Please enter a valid 10-digit Indian mobile number"
            ]
        },


        // ========================================
        // PASSWORD
        // ========================================

        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
            select: false
        },


        // ========================================
        // EMAIL VERIFIED
        // ========================================

        isEmailVerified: {
            type: Boolean,
            default: false
        },


        // ========================================
        // ACCOUNT VERIFIED
        // ========================================

        isVerified: {
            type: Boolean,
            default: false
        },


        // ========================================
        // ROLE
        // ========================================

        role: {
            type: String,
            enum: {
                values: ["student", "admin"],
                message: "Invalid user role"
            },
            default: "student"
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
// INDEXES
// ========================================

userSchema.index({
    email: 1
});

userSchema.index({
    phone: 1
});

userSchema.index({
    role: 1
});


// ========================================
// USER MODEL
// ========================================

const User = mongoose.model(
    "User",
    userSchema
);


// ========================================
// EXPORT
// ========================================

module.exports = User;

