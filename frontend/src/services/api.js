export const mergeFiles = async (files) => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file); // MUST match backend
  });

  const response = await fetch("http://127.0.0.1:5000/merge/", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Merge failed");
  }

  return await response.blob();
};