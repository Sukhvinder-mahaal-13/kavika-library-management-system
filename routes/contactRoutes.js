const express = require("express");

const router = express.Router();


// ========================================
// CONTACT PAGE
// ========================================

router.get("/", (req, res) => {

    res.render("contact/contact");

});


module.exports = router;