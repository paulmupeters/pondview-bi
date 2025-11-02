import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    
    // List all files in uploads directory and find matching fileId
    let files: string[] = [];
    try {
      files = await readdir(UPLOAD_DIR);
    } catch (error) {
      // Directory doesn't exist or can't be read
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    
    // Find file that starts with the fileId
    const matchingFile = files.find((file) => file.startsWith(fileId + "_"));
    
    if (!matchingFile) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const filePath = join(UPLOAD_DIR, matchingFile);
    
    try {
      const fileBuffer = await readFile(filePath);
      
      // Extract original filename from the stored filename
      // Format: fileId_sanitizedOriginalName
      const originalName = matchingFile.substring(fileId.length + 1);
      
      // Determine content type from extension
      const extension = originalName.toLowerCase().substring(originalName.lastIndexOf("."));
      const contentTypeMap: Record<string, string> = {
        ".csv": "text/csv",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
        ".parquet": "application/octet-stream",
      };
      
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": contentTypeMap[extension] || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${originalName}"`,
        },
      });
    } catch (error) {
      console.error("Failed to read file:", error);
      return NextResponse.json(
        { error: "Failed to read file from disk" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("File fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch file" },
      { status: 500 }
    );
  }
}

