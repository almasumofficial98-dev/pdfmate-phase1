import { useState, useRef, useReducer } from "react";
import * as pdfjsLib from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker?url";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

const initialState = {
  past: [],
  present: { pages: [], selectedIds: [] },
  future: []
};

function pushHistory(state, newPresent) {
  return {
    past: [...state.past, state.present],
    present: newPresent,
    future: []
  };
}

function editorReducer(state, action) {
  switch (action.type) {
    case "INIT":
      return { past: [], present: { pages: action.payload, selectedIds: [] }, future: [] };
    
    case "UNDO":
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      return { past: newPast, present: previous, future: [state.present, ...state.future] };
    
    case "REDO":
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return { past: [...state.past, state.present], present: next, future: newFuture };

    case "MOVE_PAGE":
      const { oldIndex, newIndex } = action.payload;
      return pushHistory(state, {
        ...state.present,
        pages: arrayMove(state.present.pages, oldIndex, newIndex)
      });

    case "DELETE":
      const idsToDelete = action.payload;
      return pushHistory(state, {
        pages: state.present.pages.filter(p => !idsToDelete.includes(p.id)),
        selectedIds: state.present.selectedIds.filter(id => !idsToDelete.includes(id))
      });

    case "ROTATE":
      const idsToRotate = action.payload;
      return pushHistory(state, {
        ...state.present,
        pages: state.present.pages.map(p => 
          idsToRotate.includes(p.id) ? { ...p, rotation: (p.rotation + 90) % 360 } : p
        )
      });

    case "DUPLICATE":
      const idsToDuplicate = action.payload;
      const newPages = [];
      state.present.pages.forEach(p => {
        newPages.push(p);
        if (idsToDuplicate.includes(p.id)) {
          newPages.push({ ...p, id: `${p.id}-copy-${Math.random().toString(36).substring(2, 9)}` });
        }
      });
      return pushHistory(state, { ...state.present, pages: newPages });

    case "AUTO_GROUP":
      const groupedPages = [...state.present.pages].sort((a, b) => {
        if (a.fileIndex === b.fileIndex) return a.pageNumber - b.pageNumber;
        return a.fileIndex - b.fileIndex;
      });
      return pushHistory(state, { ...state.present, pages: groupedPages });

    case "TOGGLE_SELECT":
      const id = action.payload;
      const isSelected = state.present.selectedIds.includes(id);
      return {
        ...state,
        present: {
          ...state.present,
          selectedIds: isSelected 
            ? state.present.selectedIds.filter(i => i !== id) 
            : [...state.present.selectedIds, id]
        }
      };
      
    case "SET_SELECTION":
      return { ...state, present: { ...state.present, selectedIds: action.payload } };

    default:
      return state;
  }
}

function SortableItem({ page, onAction, isNewFile, isSelected, onPreview }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative group w-[220px] shrink-0 bg-white rounded-xl border p-3 flex flex-col transition-all duration-300 ${
        isDragging 
          ? "shadow-2xl scale-105 cursor-grabbing ring-4 ring-blue-500 border-transparent" 
          : "hover:shadow-lg hover:border-slate-300 cursor-grab border-slate-200"
      } ${isNewFile && !isDragging ? "ml-12" : "ml-0"} ${
        isSelected && !isDragging ? "ring-2 ring-blue-500 bg-blue-50" : ""
      }`}
    >
      {isNewFile && !isDragging && (
        <div className="absolute -left-8 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="w-px h-full border-l-2 border-dashed border-blue-300"></div>
          <div className="absolute top-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap bg-blue-50 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm border border-blue-200 uppercase tracking-wider">
            {page.fileName}
          </div>
        </div>
      )}

      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onAction("TOGGLE_SELECT", page.id); }}
        className={`absolute top-4 left-4 w-6 h-6 rounded-md border-2 z-20 flex items-center justify-center transition-colors ${
          isSelected ? "bg-blue-500 border-blue-500 text-white" : "bg-white/80 border-slate-400 text-transparent hover:border-blue-500"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </button>

      <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
        <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAction("DELETE", [page.id]); }} className="w-8 h-8 bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center rounded-full backdrop-blur-sm" title="Remove Page">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAction("ROTATE", [page.id]); }} className="w-8 h-8 bg-slate-800/80 hover:bg-slate-900 text-white flex items-center justify-center rounded-full backdrop-blur-sm" title="Rotate 90°">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v5h5" /></svg>
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAction("DUPLICATE", [page.id]); }} className="w-8 h-8 bg-blue-600/80 hover:bg-blue-700 text-white flex items-center justify-center rounded-full backdrop-blur-sm" title="Duplicate Page">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onPreview(page); }} className="w-8 h-8 bg-emerald-600/80 hover:bg-emerald-700 text-white flex items-center justify-center rounded-full backdrop-blur-sm" title="Fullscreen Preview">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>

        <img
          src={page.thumbnail}
          alt={`Page ${page.pageNumber}`}
          className={`w-full h-full object-contain transition-transform duration-300 ${isSelected ? "opacity-90" : ""}`}
          style={{ transform: `rotate(${page.rotation}deg) scale(${page.rotation % 180 !== 0 ? 0.75 : 1})` }}
        />
      </div>

      <div className="mt-4 flex flex-col items-center justify-center gap-1">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${isSelected ? "bg-blue-600 text-white" : "bg-slate-700 text-white"}`}>
          Page {page.pageNumber}
        </span>
        <span className="text-xs font-medium text-slate-500 truncate w-full text-center px-1" title={page.fileName}>
          {page.fileName}
        </span>
      </div>
    </div>
  );
}

export default function Merge() {
  const [pdfFiles, setPdfFiles] = useState([]);
  const [state, dispatch] = useReducer(editorReducer, initialState);
  
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState(null);
  
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [previewPage, setPreviewPage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({ title: "", author: "", compress: false });

  const inputRef = useRef(null);
  const { pages, selectedIds } = state.present;

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setPdfFiles(prev => [...prev, ...files]);
    let allPages = [...pages];
    let fileIndexOffset = pdfFiles.length;

    for (let i = 0; i < files.length; i++) {
      const buffer = await files[i].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const actualFileIndex = fileIndexOffset + i;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.8 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;

        allPages.push({
          id: `${actualFileIndex}-${pageNum}`,
          fileIndex: actualFileIndex,
          fileName: files[i].name.replace(".pdf", ""),
          pageNumber: pageNum,
          thumbnail: canvas.toDataURL(),
          rotation: 0
        });
      }
    }
    dispatch({ type: "INIT", payload: allPages });
    setEditMode(true);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex(p => p.id === active.id);
    const newIndex = pages.findIndex(p => p.id === over.id);
    dispatch({ type: "MOVE_PAGE", payload: { oldIndex, newIndex } });
  };

  const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
    duration: 250,
    easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  };

  const handleAction = (type, payload) => dispatch({ type, payload });

  const handleMerge = async (mergeOnlySelected = false) => {
    if (pages.length === 0) return;
    
    setIsMerging(true);
    setProgress(10);
    setShowSettings(false);

    const targetPages = mergeOnlySelected ? pages.filter(p => selectedIds.includes(p.id)) : pages;
    const formData = new FormData();
    pdfFiles.forEach(file => formData.append("files", file));

    formData.append("order", JSON.stringify(
      targetPages.map(p => ({ fileIndex: p.fileIndex, pageNumber: p.pageNumber, rotation: p.rotation }))
    ));

    // Properly stringified metadata payload
    formData.append("metadata", JSON.stringify({ title: pdfOptions.title, author: pdfOptions.author }));
    formData.append("compress", pdfOptions.compress);

    setProgress(40);

    try {
      const response = await fetch("http://127.0.0.1:5000/merge/", { method: "POST", body: formData });
      setProgress(80);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = mergeOnlySelected ? "split_selected.pdf" : (pdfOptions.title ? `${pdfOptions.title}.pdf` : "merged.pdf");
      a.click();
      
      setProgress(100);
    } catch (error) {
      console.error("Merge failed", error);
      alert("Failed to merge documents.");
    } finally {
      setTimeout(() => { setIsMerging(false); setProgress(0); }, 800);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-12 px-6 relative">
      
      {previewPage && (
        <div className="fixed inset-0 bg-slate-900/95 z-[100] flex flex-col items-center justify-center p-8 backdrop-blur-sm" onClick={() => setPreviewPage(null)}>
          <div className="flex justify-between w-full max-w-5xl mb-4 text-white">
            <h3 className="font-bold text-xl">{previewPage.fileName} <span className="text-slate-400">| Page {previewPage.pageNumber}</span></h3>
            <button className="text-white hover:text-red-400 font-bold flex items-center gap-2" onClick={() => setPreviewPage(null)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> Close
            </button>
          </div>
          <img 
            src={previewPage.thumbnail} 
            className="max-h-[85vh] object-contain rounded-lg shadow-2xl transition-transform"
            style={{ transform: `rotate(${previewPage.rotation}deg)` }}
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

      {isMerging && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md flex flex-col items-center text-center">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Processing Document</h3>
            <p className="text-slate-500 text-sm mb-6">Applying formatting, compression, and merging...</p>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white w-full max-w-7xl rounded-3xl shadow-sm border border-slate-200 p-8">
        {!editMode && (
          <div className="py-12">
            <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-8 text-center">Merge & Reorder PDFs</h1>
            <div onClick={() => inputRef.current.click()} className="border-2 border-dashed border-slate-300 rounded-3xl p-16 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors group">
              <input ref={inputRef} type="file" multiple accept="application/pdf" onChange={handleUpload} className="hidden" />
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </div>
              <p className="text-slate-700 font-semibold text-xl mb-2">Click or drag to upload PDFs</p>
            </div>
          </div>
        )}

        {editMode && (
          <>
            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-8 gap-4 pb-6 border-b border-slate-100 min-h-[60px]">
              
              <div className="flex flex-col gap-3 w-full xl:w-auto">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-800 mr-2">Review Pages</h2>
                  
                  <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                    <button onClick={() => dispatch({ type: "UNDO" })} disabled={state.past.length === 0} className={`p-1.5 rounded-md flex items-center gap-1 text-sm font-medium transition-colors ${state.past.length === 0 ? "text-slate-400 cursor-not-allowed" : "text-slate-700 hover:bg-white hover:shadow-sm"}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    </button>
                    <button onClick={() => dispatch({ type: "REDO" })} disabled={state.future.length === 0} className={`p-1.5 rounded-md flex items-center gap-1 text-sm font-medium transition-colors ${state.future.length === 0 ? "text-slate-400 cursor-not-allowed" : "text-slate-700 hover:bg-white hover:shadow-sm"}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                    </button>
                  </div>

                  <button onClick={() => handleAction("AUTO_GROUP")} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg> Auto-Group Sort
                  </button>
                </div>

                {selectedIds.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 bg-blue-50 px-4 py-2 rounded-xl border border-blue-200">
                    <span className="text-blue-800 font-bold px-2">{selectedIds.length} Selected</span>
                    <div className="w-px h-6 bg-blue-200 mx-1"></div>
                    <button onClick={() => handleAction("ROTATE", selectedIds)} className="text-sm font-medium text-slate-700 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100">Rotate</button>
                    <button onClick={() => handleAction("DUPLICATE", selectedIds)} className="text-sm font-medium text-slate-700 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100">Duplicate</button>
                    <button onClick={() => handleAction("DELETE", selectedIds)} className="text-sm font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-50">Delete</button>
                    <button onClick={() => handleAction("SET_SELECTION", [])} className="text-sm font-medium text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleAction("SET_SELECTION", pages.map(p => p.id))} className="text-sm text-blue-600 font-medium hover:underline">Select All</button>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 w-full xl:w-auto mt-4 xl:mt-0 items-center">
                {selectedIds.length > 0 && (
                  <button onClick={() => handleMerge(true)} className="px-5 py-3 font-semibold rounded-xl transition-all flex items-center gap-2 border-2 border-blue-600 text-blue-600 hover:bg-blue-50">
                     Export Selected ({selectedIds.length})
                  </button>
                )}
                
                <div className="relative">
                  <button onClick={() => setShowSettings(!showSettings)} className="w-12 h-12 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                  
                  {showSettings && (
                    <div className="absolute right-0 top-14 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 p-5 z-40">
                      <h4 className="font-bold text-slate-800 mb-4">PDF Metadata & Settings</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Title</label>
                          <input type="text" value={pdfOptions.title} onChange={e => setPdfOptions({...pdfOptions, title: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Document Title" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Author</label>
                          <input type="text" value={pdfOptions.author} onChange={e => setPdfOptions({...pdfOptions, author: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Your Name" />
                        </div>
                        <label className="flex items-center gap-2 mt-4 cursor-pointer">
                          <input type="checkbox" checked={pdfOptions.compress} onChange={e => setPdfOptions({...pdfOptions, compress: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                          <span className="text-sm font-medium text-slate-700">Compress File Size</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleMerge(false)}
                  disabled={pages.length === 0}
                  className={`px-6 py-3 font-semibold rounded-xl shadow-md transition-all flex items-center gap-2 justify-center ${
                    pages.length === 0 ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none" : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg active:scale-95"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  Merge All ({pages.length})
                </button>
              </div>
            </div>

            <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100">
              <div className="flex gap-4 overflow-x-auto pb-6 pt-2 px-6 
                [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-track]:rounded-full 
                [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400"
              >
                {pages.length === 0 ? (
                  <div className="w-full text-center py-12 text-slate-500 font-medium flex flex-col items-center">
                    <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    All pages deleted. Use Undo to revert.
                  </div>
                ) : (
                  <DndContext collisionDetection={closestCenter} onDragStart={(e) => setActiveId(e.active.id)} onDragEnd={handleDragEnd} autoScroll={true}>
                    <SortableContext items={pages.map(p => p.id)} strategy={horizontalListSortingStrategy}>
                      {pages.map((page, index) => {
                        const isNewFile = index === 0 || pages[index - 1].fileName !== page.fileName;
                        return (
                          <SortableItem key={page.id} page={page} onAction={handleAction} isNewFile={isNewFile} isSelected={selectedIds.includes(page.id)} onPreview={setPreviewPage} />
                        );
                      })}
                    </SortableContext>

                    <DragOverlay dropAnimation={dropAnimationConfig}>
                      {activeId ? (
                        <div className="w-[220px] bg-white shadow-2xl rounded-xl border-2 border-blue-500 p-3 flex flex-col scale-105 opacity-90 cursor-grabbing">
                           <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                             <span className="text-slate-500 font-medium">Moving...</span>
                           </div>
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}