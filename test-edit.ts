import fs from "fs";
const file = fs.readFileSync("/Users/shivampandey/Downloads/jcbb-project-fixed-v2/src/utils/exportPdf.ts", "utf8");
console.log(file.includes("const summaryBody: string[][] = [];"));
