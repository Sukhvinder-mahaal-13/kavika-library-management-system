const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Note = require("../models/Note");


// ========================================
// NOTES UPLOAD FOLDER
// ========================================

const uploadDir = path.join(__dirname, "../public/notes");


// Folder nahi hai to automatically create hoga
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}


// ========================================
// MULTER STORAGE
// ========================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1E9) +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }

});


// ========================================
// ONLY PDF ALLOWED
// ========================================

const upload = multer({

    storage: storage,

    fileFilter: function (req, file, cb) {

        const extension =
            path.extname(file.originalname).toLowerCase();

        if (extension === ".pdf") {

            cb(null, true);

        } else {

            cb(new Error("Only PDF files are allowed"));

        }

    }

});


// ========================================
// ADMIN MIDDLEWARE
// ========================================

function isAdmin(req, res, next) {

    if (
        req.session.userId &&
        req.session.userRole === "admin"
    ) {

        return next();

    }

    return res.status(403).send("Access Denied");

}


// ========================================
// USER NOTES PAGE
// ========================================

router.get("/", async (req, res) => {

    try {

        const notes = await Note.find()
            .sort({ createdAt: -1 });

        res.render("notes/notes", {
            notes
        });

    } catch (error) {

        console.log(error);

        res.status(500).send("Unable to load notes");

    }

});


// ========================================
// ADMIN NOTES PAGE
// ========================================

router.get("/admin", isAdmin, async (req, res) => {

    try {

        const notes = await Note.find()
            .sort({ createdAt: -1 });

        res.render("notes/admin", {
            notes
        });

    } catch (error) {

        console.log(error);

        res.status(500).send("Unable to load admin notes");

    }

});


// ========================================
// ADMIN UPLOAD NOTE
// ========================================

router.post(
    "/admin/upload",
    isAdmin,
    upload.single("pdf"),
    async (req, res) => {

        try {

            const {
                title,
                description
            } = req.body;


            if (!title || !description || !req.file) {

                if (req.file) {

                    fs.unlinkSync(req.file.path);

                }

                return res
                    .status(400)
                    .send("Title, description and PDF are required");

            }


            const note = new Note({

                title: title,

                description: description,

                file: "/notes/" + req.file.filename,

                originalName: req.file.originalname

            });


            await note.save();


            res.redirect("/notes/admin");


        } catch (error) {

            console.log(error);

            if (req.file) {

                try {

                    fs.unlinkSync(req.file.path);

                } catch (deleteError) {

                    console.log(deleteError);

                }

            }

            res.status(500).send("Unable to upload note");

        }

    }
);


// ========================================
// ADMIN DELETE NOTE
// ========================================

router.post(
    "/admin/delete/:id",
    isAdmin,
    async (req, res) => {

        try {

            const note = await Note.findById(req.params.id);


            if (!note) {

                return res.status(404).send("Note not found");

            }


            const filePath = path.join(
                __dirname,
                "../public",
                note.file
            );


            if (fs.existsSync(filePath)) {

                fs.unlinkSync(filePath);

            }


            await Note.findByIdAndDelete(req.params.id);


            res.redirect("/notes/admin");


        } catch (error) {

            console.log(error);

            res.status(500).send("Unable to delete note");

        }

    }
);


module.exports = router;