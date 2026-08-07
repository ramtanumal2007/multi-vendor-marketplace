import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const dirPath = path.join(process.cwd(), "app", "(seller)");
    fs.rmSync(dirPath, { recursive: true, force: true });
    return NextResponse.json({ success: true, message: "Directory deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
