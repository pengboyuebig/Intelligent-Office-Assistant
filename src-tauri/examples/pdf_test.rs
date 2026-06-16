use std::fs;

fn main() {
    let files = fs::read_dir(r"c:\Users\glkj_\Downloads")
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains("应急"))
        .collect::<Vec<_>>();

    let path = files.first().unwrap().path();
    let data = fs::read(&path).unwrap();
    println!(
        "PDF: {:?} ({} bytes)",
        path.file_name().unwrap(),
        data.len()
    );

    // 调用实际的 extract_text_from_pdf（使用 Python 后端）
    let text = chroma_version_lib::commands::knowledge::extract_text_from_pdf(&data).unwrap();
    println!("OK: {} chars", text.chars().count());
    let p: String = text.chars().take(1000).collect();
    println!("---TEXT---\n{}\n---END---", p);
}
