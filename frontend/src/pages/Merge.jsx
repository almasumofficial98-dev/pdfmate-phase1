import { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker?url";
import {
  DndContext,
  closestCenter
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

function SortableItem({ page }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 250ms cubic-bezier(0.22, 1, 0.36, 1)"
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="min-w-[260px] bg-white shadow-lg rounded-2xl p-3 cursor-grab active:cursor-grabbing hover:shadow-xl transition-all duration-300"
    >
      <img
        src={page.thumbnail}
        alt=""
        className="w-full rounded-lg border"
      />

      <div className="mt-2 text-center text-xs text-slate-500 font-medium">
        {page.fileName}_Page{page.pageNumber}
      </div>
    </div>
  );
}

export default function Merge() {
  const [pdfFiles, setPdfFiles] = useState([]);
  const [pages, setPages] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleUpload = async (e) => {
    try {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      setPdfFiles(files);

      let allPages = [];

      for (let i = 0; i < files.length; i++) {
        const buffer = await files[i].arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 0.8 });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport
          }).promise;

          allPages.push({
            id: `${i}-${pageNum}`,
            fileIndex: i,
            fileName: files[i].name.replace(".pdf", ""),
            pageNumber: pageNum,
            thumbnail: canvas.toDataURL()
          });
        }
      }

      setPages(allPages);
      setEditMode(true);
    } catch (err) {
      console.error(err);
      setError("Failed to process PDF files.");
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pages.findIndex(p => p.id === active.id);
    const newIndex = pages.findIndex(p => p.id === over.id);

    setPages(arrayMove(pages, oldIndex, newIndex));
  };

  const handleMerge = async () => {
    try {
      setLoading(true);

      const formData = new FormData();

      pdfFiles.forEach(file => {
        formData.append("files", file);
      });

      formData.append(
        "order",
        JSON.stringify(
          pages.map(p => ({
            fileIndex: p.fileIndex,
            pageNumber: p.pageNumber
          }))
        )
      );

      const response = await fetch("http://127.0.0.1:5000/merge/", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Merge failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "merged.pdf";
      a.click();

      setEditMode(false);
      setPages([]);
      setPdfFiles([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-7xl rounded-3xl shadow-2xl p-10">

        {!editMode && (
          <>
            <h1 className="text-4xl font-bold mb-4">Merge PDF Files</h1>
            <p className="text-slate-500 mb-8">
              Upload PDFs to edit page order before merging.
            </p>

            <div
              onClick={() => inputRef.current.click()}
              className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition"
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="application/pdf"
                onChange={handleUpload}
                className="hidden"
              />
              <p className="text-blue-600 font-semibold text-lg">
                Click to upload PDFs
              </p>
              <p className="text-sm text-slate-400 mt-2">
                Maximum size: 10MB per file
              </p>
            </div>
          </>
        )}

        {editMode && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                Drag pages to reorder
              </h2>

              <button
                onClick={() => setEditMode(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                Back
              </button>
            </div>

            <div
              className="flex gap-6 overflow-x-auto pb-6 custom-scroll"
            >
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={pages.map(p => p.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {pages.map(page => (
                    <SortableItem key={page.id} page={page} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleMerge}
                disabled={loading}
                className="px-10 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition text-lg shadow-lg"
              >
                {loading ? "Merging..." : "Confirm & Merge"}
              </button>
            </div>

            {error && (
              <div className="mt-4 bg-red-100 text-red-600 p-3 rounded">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Custom Scrollbar */}
      <style>
        {`
        .custom-scroll::-webkit-scrollbar {
          height: 8px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        `}
      </style>
    </div>
  );
}