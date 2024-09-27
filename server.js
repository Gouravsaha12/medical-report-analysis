require("dotenv").config();
const express = require("express")
const multer = require("multer")
const PDFDocument = require("pdfkit")
const fs = require("fs")
const path = require("path")
const { GoogleGenerativeAI } = require("@google/generative-ai");

const fsPromise = fs.promises
const app = express()
const PORT = process.env.PORT || 3000

const upload = multer({ dest: "/upload" })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

app.use(express.json({ limit: "10mb" }))
app.use(express.static("public"))

app.post("/analyze", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image uploaded" })
        }
        const imagePath = req.file.path;
        const imageData = await fsPromise.readFile(imagePath, {
            encoding: "base64"
        })
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
            "Analyze this image of medical report and provide detailed analysis of it. Please provide the response in plain text without using any markdown formatting. use no bulet no bold etc. devide it in 3 sections 1 summary , 2 problems if something is high or low, 3 possible solutions and steps to take, make it as detailed as possible be creative and informative. dont use any bold or anything even for title",
            {
                inlineData: {
                    mimeType: req.file.mimetype,
                    data: imageData,
                },
            },
        ]);
        const medicalInfo = result.response.text();
        await fsPromise.unlink(imagePath);

        res.json({
            result: medicalInfo,
            image: `data:${req.file.mimetype};base64,${imageData}`,
        });

    } catch (e) {
        res.status(500).json({ error: `An Error Occured ${e}` })
    }
})

app.post("/download", async (req, res) => {
    const { result, image } = req.body;
    try {
        //Ensure the reports directory exists
        const reportsDir = path.join(__dirname, "reports");
        await fsPromise.mkdir(reportsDir, { recursive: true });
        //generate pdf
        const filename = `plant_analysis_report_${Date.now()}.pdf`;
        const filePath = path.join(reportsDir, filename);
        const writeStream = fs.createWriteStream(filePath);
        const doc = new PDFDocument();
        doc.pipe(writeStream);
        // Add content to the PDF
        doc.fontSize(24).text("Medical Report Analysis", {
            align: "center",
        });
        doc.moveDown();
        doc.fontSize(24).text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();
        doc.fontSize(14).text(result, { align: "left" });
        //insert image to the pdf
        if (image) {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");
            doc.moveDown();
            doc.image(buffer, {
                fit: [500, 300],
                align: "center",
                valign: "center",
            });
        }
        doc.end();
        //wait for the pdf to be created
        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });
        res.download(filePath, (err) => {
            if (err) {
                res.status(500).json({ error: "Error downloading the PDF report" });
            }
            fsPromise.unlink(filePath);
        });
    } catch (error) {
        console.error("Error generating PDF report:", error);
        res
            .status(500)
            .json({ error: "An error occurred while generating the PDF report" });
    }
});


app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`)
})