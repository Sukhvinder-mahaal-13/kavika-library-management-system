
const mongoose = require("mongoose");

// ========================================
// SEAT SCHEMA
// ========================================

const seatSchema = new mongoose.Schema(
    {

        // ========================================
        // SEAT NUMBER
        // ========================================

        seatNumber: {
            type: Number,
            required: [true, "Seat number is required"],
            unique: true,
            min: [1, "Seat number must be at least 1"],
            validate: {
                validator: Number.isInteger,
                message: "Seat number must be a whole number"
            }
        },


        // ========================================
        // SEAT STATUS
        // ========================================

        status: {
            type: String,
            enum: {
                values: [
                    "available",
                    "booked"
                ],
                message: "Invalid seat status"
            },
            default: "available"
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
// SEAT NUMBER INDEX
// ========================================

seatSchema.index({
    seatNumber: 1
});


// ========================================
// SEAT MODEL
// ========================================

const Seat = mongoose.model(
    "Seat",
    seatSchema
);


// ========================================
// EXPORT
// ========================================

module.exports = Seat;

