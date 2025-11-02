import { writeFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

export const runtime = "nodejs";
export const maxDuration = 30;

// Configure file upload limits
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".parquet"];
const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const fileExtension = file.name
      .toLowerCase()
      .substring(file.name.lastIndexOf("."));
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json(
        { error: "Invalid file type. Only CSV, XLSX, and Parquet files are allowed." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.` },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileId = nanoid();
    const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${fileId}_${sanitizedOriginalName}`;
    const filePath = join(UPLOAD_DIR, fileName);

    // Ensure upload directory exists
    try {
      await import("fs/promises").then((fs) =>
        fs.mkdir(UPLOAD_DIR, { recursive: true })
      );
    } catch (error) {
      console.error("Failed to create upload directory:", error);
    }

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Return file path that DuckDB can use
    // Return the relative path from project root
    return NextResponse.json({
      fileId,
      fileName: sanitizedOriginalName,
      filePath: `uploads/${fileName}`,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

