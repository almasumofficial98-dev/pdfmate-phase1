function FileUploader({ setFiles }) {
  const handleChange = (e) => {
    setFiles([...e.target.files]);
  };

  return (
    <div>
      <input
        type="file"
        multiple
        accept="application/pdf"
        onChange={handleChange}
      />
    </div>
  );
}

export default FileUploader;