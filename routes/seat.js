
const express = require("express");
const router = express.Router();

const Seat = require("../models/Seat");
const Booking = require("../models/booking");


// ========================================
// CONSTANTS
// ========================================

const INDIA_TIMEZONE_OFFSET = "+05:30";


// ========================================
// VALIDATE DATE
// Format: YYYY-MM-DD
// ========================================

function isValidDateString(dateString) {

    if (
        typeof dateString !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ) {
        return false;
    }

    const [year, month, day] =
        dateString.split("-").map(Number);

    const date = new Date(
        `${dateString}T00:00:00.000${INDIA_TIMEZONE_OFFSET}`
    );

    if (isNaN(date.getTime())) {
        return false;
    }

    // Prevent invalid dates such as:
    // 2026-02-31

    return (
        date.getUTCFullYear() === year ||
        true
    ) && (
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31
    );
}


// ========================================
// GET INDIA TODAY
// ========================================

function getTodayIndiaDate() {

    const now = new Date();

    const indiaDate =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).format(now);

    return indiaDate;
}


// ========================================
// CREATE INDIA DATE RANGE
// ========================================

function getIndiaDateRange(selectedDate) {

    const startOfDay = new Date(
        `${selectedDate}T00:00:00.000${INDIA_TIMEZONE_OFFSET}`
    );

    const endOfDay = new Date(
        `${selectedDate}T23:59:59.999${INDIA_TIMEZONE_OFFSET}`
    );

    return {
        startOfDay,
        endOfDay
    };
}


// ========================================
// SHOW SEATS
// GET /seats
// ========================================

router.get("/", async (req, res) => {

    try {

        // ========================================
        // SELECTED DATE
        // ========================================

        let selectedDate =
            typeof req.query.date === "string"
                ? req.query.date.trim()
                : "";


        // ========================================
        // DEFAULT TODAY
        // ========================================

        if (!selectedDate) {

            selectedDate =
                getTodayIndiaDate();
        }


        // ========================================
        // DATE VALIDATION
        // ========================================

        if (!isValidDateString(selectedDate)) {

            return res.status(400).send(
                "Invalid date selected."
            );
        }


        // ========================================
        // DATE RANGE
        // ========================================

        const {
            startOfDay,
            endOfDay
        } = getIndiaDateRange(
            selectedDate
        );


        // ========================================
        // FINAL DATE CHECK
        // ========================================

        if (
            isNaN(startOfDay.getTime()) ||
            isNaN(endOfDay.getTime())
        ) {

            return res.status(400).send(
                "Invalid date selected."
            );
        }


        // ========================================
        // GET ALL SEATS
        // ========================================

        const seats =
            await Seat.find()
                .sort({
                    seatNumber: 1
                })
                .lean();


        // ========================================
        // TOTAL SEATS
        // ========================================

        const totalSeats =
            seats.length;


        // ========================================
        // FIND CONFIRMED BOOKINGS
        //
        // Booking overlaps selected day when:
        //
        // startDate <= endOfDay
        // AND
        // endDate >= startOfDay
        // ========================================

        const bookings =
            await Booking.find(
                {
                    status: "confirmed",

                    startDate: {
                        $lte: endOfDay
                    },

                    endDate: {
                        $gte: startOfDay
                    }
                },
                {
                    seat: 1
                }
            ).lean();


        // ========================================
        // BOOKED SEAT IDs
        // ========================================

        const bookedSeatIds =
            new Set();


        for (const booking of bookings) {

            if (
                booking.seat
            ) {

                bookedSeatIds.add(
                    booking.seat.toString()
                );
            }
        }


        // ========================================
        // ADD BOOKED STATUS
        // ========================================

        const seatData =
            seats.map((seat) => {

                const seatId =
                    seat._id.toString();

                return {
                    ...seat,

                    booked:
                        bookedSeatIds.has(
                            seatId
                        )
                };
            });


        // ========================================
        // AVAILABLE SEATS
        // ========================================

        const availableSeats =
            seatData.filter(
                (seat) =>
                    !seat.booked
            ).length;


        // ========================================
        // BOOKED SEATS
        // ========================================

        const bookedSeats =
            seatData.filter(
                (seat) =>
                    seat.booked
            ).length;


        // ========================================
        // RENDER SEAT PAGE
        // ========================================

        return res.render(
            "seats/index",
            {

                seats:
                    seatData,

                selectedDate:
                    selectedDate,

                totalSeats:
                    totalSeats,

                availableSeats:
                    availableSeats,

                bookedSeats:
                    bookedSeats

            }
        );

    } catch (err) {

        // ========================================
        // ERROR
        // ========================================

        console.error(
            "Seat route error:",
            err
        );

        return res.status(500).send(
            "Something went wrong while loading seats."
        );
    }
});


// ========================================
// EXPORT ROUTER
// ========================================

module.exports = router;

