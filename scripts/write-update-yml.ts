import { writeUpdateFeed } from "../src/main/updateFeed.ts"

const [version, artifactPath, outFile] = process.argv.slice(2)
if (!version || !artifactPath || !outFile) {
  console.error("usage: write-update-yml <version> <artifact> <out-file>")
  process.exit(1)
}

const feed = writeUpdateFeed({ version, artifactPath, outFile })
console.log(`feed  ${feed.path} ${feed.size} ${outFile}`)
