
const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const mongoose = require("mongoose");

const Gallery = require("../models/gallery");

const router = express.Router();

// ========================================
// UPLOAD FOLDER
// ========================================

const uploadPath = path.resolve(
    __dirname,
    "../public/images/gallery"
);

// Create folder if it does not exist

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, {
        recursive: true
    });
}

// ========================================
// MULTER STORAGE
// ========================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },

    filename: function (req, file, cb) {

        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        const uniqueName =
            `${Date.now()}-${crypto
                .randomBytes(8)
                .toString("hex")}${extension}`;

        cb(null, uniqueName);
    }
});

// ========================================
// MULTER
// ========================================

const upload = multer({

    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        const allowedExtensions = [
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
            ".gif"
        ];

        const allowedMimeTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (
            allowedExtensions.includes(extension) &&
            allowedMimeTypes.includes(file.mimetype)
        ) {
            return cb(null, true);
        }

        return cb(
            new Error(
                "Only JPG, JPEG, PNG, WEBP and GIF images are allowed!"
            )
        );
    }
});

// ========================================
// ADMIN CHECK
// ========================================

function isAdmin(req, res, next) {

    if (
        !req.session ||
        !req.session.userId
    ) {
        return res.redirect(
            "/users/login"
        );
    }

    if (
        req.session.userRole !== "admin"
    ) {
        return res.status(403).send(
            "Access Denied! Admin only."
        );
    }

    next();
}

// ========================================
// SAFE FILE DELETE
// ========================================

function deleteGalleryFile(imageUrl) {

    if (
        typeof imageUrl !== "string" ||
        !imageUrl.startsWith(
            "/images/gallery/"
        )
    ) {
        return;
    }

    const filename = path.basename(
        imageUrl
    );

    if (!filename) {
        return;
    }

    const imagePath = path.resolve(
        uploadPath,
        filename
    );

    // Make sure file is inside gallery folder

    if (
        path.dirname(imagePath) !==
        uploadPath
    ) {
        return;
    }

    try {

        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

    } catch (err) {

        console.error(
            "Gallery file delete error:",
            err
        );
    }
}

// ========================================
// PUBLIC GALLERY
// GET /gallery
// ========================================

router.get(
    "/",
    async (req, res) => {

        try {

            const images =
                await Gallery.find()
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            return res.render(
                "gallery",
                {
                    images
                }
            );

        } catch (err) {

            console.error(
                "Gallery error:",
                err
            );

            return res.status(500).send(
                "Unable to load gallery"
            );
        }
    }
);

// ========================================
// ADMIN GALLERY
// GET /gallery/admin
// ========================================

router.get(
    "/admin",
    isAdmin,
    async (req, res) => {

        try {

            const images =
                await Gallery.find()
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            return res.render(
                "admin/gallery",
                {
                    images
                }
            );

        } catch (err) {

            console.error(
                "Admin gallery error:",
                err
            );

            return res.status(500).send(
                "Unable to load admin gallery"
            );
        }
    }
);

// ========================================
// UPLOAD IMAGE
// POST /gallery/admin/upload
// ========================================

router.post(
    "/admin/upload",
    isAdmin,
    (req, res, next) => {

        upload.single("image")(
            req,
            res,
            function (err) {

                if (err instanceof multer.MulterError) {

                    if (
                        err.code ===
                        "LIMIT_FILE_SIZE"
                    ) {
                        return res.status(400).send(
                            "Image size must be 5 MB or less!"
                        );
                    }

                    return res.status(400).send(
                        "Image upload failed!"
                    );
                }

                if (err) {

                    return res.status(400).send(
                        err.message ||
                        "Invalid image file!"
                    );
                }

                next();
            }
        );
    },

    async (req, res) => {

        try {

            // ========================================
            // IMAGE CHECK
            // ========================================

            if (!req.file) {

                return res.status(400).send(
                    "Please choose an image!"
                );
            }

            // ========================================
            // TITLE CHECK
            // ========================================

            const title =
                typeof req.body.title === "string"
                    ? req.body.title.trim()
                    : "";

            if (!title) {

                deleteGalleryFile(
                    `/images/gallery/${req.file.filename}`
                );

                return res.status(400).send(
                    "Please enter image title!"
                );
            }

            if (title.length > 150) {

                deleteGalleryFile(
                    `/images/gallery/${req.file.filename}`
                );

                return res.status(400).send(
                    "Image title must be 150 characters or less!"
                );
            }

            // ========================================
            // IMAGE PATH
            // ========================================

            const imageUrl =
                `/images/gallery/${req.file.filename}`;

            // ========================================
            // SAVE DATABASE RECORD
            // ========================================

            const newImage =
                await Gallery.create({
                    image: imageUrl,
                    title
                });

            console.log(
                "Gallery image uploaded:",
                newImage.title
            );

            // ========================================
            // SUCCESS
            // ========================================

            return res.redirect(
                "/gallery/admin"
            );

        } catch (err) {

            console.error(
                "Gallery upload error:",
                err
            );

            // Remove uploaded file if DB save failed

            if (req.file) {

                deleteGalleryFile(
                    `/images/gallery/${req.file.filename}`
                );
            }

            return res.status(500).send(
                "Unable to upload image"
            );
        }
    }
);

// ========================================
// DELETE IMAGE
// DELETE /gallery/admin/:id
// ========================================

router.delete(
    "/admin/:id",
    isAdmin,
    async (req, res) => {

        try {

            // ========================================
            // ID VALIDATION
            // ========================================

            if (
                !mongoose.Types.ObjectId.isValid(
                    req.params.id
                )
            ) {
                return res.status(400).send(
                    "Invalid image ID!"
                );
            }

            // ========================================
            // FIND IMAGE
            // ========================================

            const image =
                await Gallery.findById(
                    req.params.id
                );

            if (!image) {

                return res.status(404).send(
                    "Image not found!"
                );
            }

            // ========================================
            // DELETE DATABASE RECORD FIRST
            // ========================================

            await Gallery.findByIdAndDelete(
                req.params.id
            );

            // ========================================
            // DELETE ACTUAL IMAGE FILE
            // ========================================

            deleteGalleryFile(
                image.image
            );

            console.log(
                "Gallery image deleted:",
                image.title
            );

            // ========================================
            // SUCCESS
            // ========================================

            return res.redirect(
                "/gallery/admin"
            );

        } catch (err) {

            console.error(
                "Gallery delete error:",
                err
            );

            return res.status(500).send(
                "Unable to delete image"
            );
        }
    }
);

// ========================================
// EXPORT
// ========================================

module.exports = router;

