import { useState, useRef, useReducer, useEffect } from "react";
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
      return pushHistory(state, { ...state.present, pages: arrayMove(state.present.pages, action.payload.oldIndex, action.payload.newIndex) });
    case "DELETE":
      return pushHistory(state, {
        pages: state.present.pages.filter(p => !action.payload.includes(p.id)),
        selectedIds: state.present.selectedIds.filter(id => !action.payload.includes(id))
      });
    case "ROTATE":
      return pushHistory(state, {
        ...state.present,
        pages: state.present.pages.map(p => action.payload.includes(p.id) ? { ...p, rotation: (p.rotation + 90) % 360 } : p)
      });
    case "DUPLICATE":
      const newPages = [];
      state.present.pages.forEach(p => {
        newPages.push(p);
        if (action.payload.includes(p.id)) {
          // The "-copy-" string is used to trigger the popcorn animation
          newPages.push({ ...p, id: `${p.id}-copy-${Math.random().toString(36).substring(2, 9)}` });
        }
      });
      return pushHistory(state, { ...state.present, pages: newPages });
    case "AUTO_GROUP":
      const groupedPages = [...state.present.pages].sort((a, b) => a.fileIndex === b.fileIndex ? a.pageNumber - b.pageNumber : a.fileIndex - b.fileIndex);
      return pushHistory(state, { ...state.present, pages: groupedPages });
    case "TOGGLE_SELECT":
      const id = action.payload;
      return {
        ...state,
        present: {
          ...state.present,
          selectedIds: state.present.selectedIds.includes(id) ? state.present.selectedIds.filter(i => i !== id) : [...state.present.selectedIds, id]
        }
      };
    case "SET_SELECTION":
      return { ...state, present: { ...state.present, selectedIds: action.payload } };
    default:
      return state;
  }
}

function SortableItem({ page, onAction, isNewFile, isSelected, onPreview, isDeleting }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  // Determine which entry/exit animation to use
  const isCopy = page.id.includes("-copy-");
  const animationClass = isDeleting
    ? "animate-[shatterGlass_0.6s_ease-in_forwards]"
    : isCopy
    ? "animate-[popcorn_0.6s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]"
    : "animate-[popIn_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative group w-[220px] shrink-0 bg-white rounded-xl border p-3 flex flex-col transition-all duration-300 ${
        isDragging ? "shadow-2xl scale-105 cursor-grabbing ring-4 ring-blue-500 border-transparent" : "hover:shadow-xl hover:border-slate-300 cursor-grab border-slate-200"
      } ${isNewFile && !isDragging ? "ml-12" : "ml-0"} ${isSelected && !isDragging ? "ring-2 ring-blue-500 bg-blue-50" : ""}`}
    >
      {/* 🌟 Dynamic Animation Wrapper */}
      <div className={`w-full h-full flex flex-col ${animationClass}`}>
        
        {isNewFile && !isDragging && (
          <div className="absolute -left-11 top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none animate-[smoothFadeIn_0.5s_ease-out]">
            <div className="w-px h-full border-l-2 border-dashed border-blue-300"></div>
            <div className="absolute top-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap bg-blue-50 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm border border-blue-200 uppercase tracking-wider">
              {page.fileName}
            </div>
          </div>
        )}

        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onAction("TOGGLE_SELECT", page.id); }}
          className={`absolute top-4 left-4 w-6 h-6 rounded-md border-2 z-20 flex items-center justify-center transition-all duration-200 active:scale-75 hover:scale-110 ${
            isSelected ? "bg-blue-500 border-blue-500 text-white" : "bg-white/80 border-slate-400 text-transparent hover:border-blue-500"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </button>

        <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 group-hover:border-blue-300 transition-colors">
          
          <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
            <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAction("DELETE", [page.id]); }} className="w-8 h-8 bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-75 hover:scale-110 shadow-lg" title="Remove Page">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAction("ROTATE", [page.id]); }} className="w-8 h-8 bg-slate-800/80 hover:bg-slate-900 text-white flex items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-75 hover:scale-110 shadow-lg" title="Rotate 90°">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v5h5" /></svg>
            </button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAction("DUPLICATE", [page.id]); }} className="w-8 h-8 bg-blue-600/80 hover:bg-blue-700 text-white flex items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-75 hover:scale-110 shadow-lg" title="Duplicate Page">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
            </button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onPreview(page); }} className="w-8 h-8 bg-emerald-600/80 hover:bg-emerald-700 text-white flex items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-75 hover:scale-110 shadow-lg" title="Fullscreen Preview">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>

          <img
            src={page.thumbnail}
            alt={`Page ${page.pageNumber}`}
            className={`w-full h-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSelected ? "opacity-90" : ""}`}
            style={{ transform: `rotate(${page.rotation}deg) scale(${page.rotation % 180 !== 0 ? 0.75 : 1})` }}
          />
        </div>

        <div className="mt-4 flex flex-col items-center justify-center gap-1">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors duration-300 ${isSelected ? "bg-blue-600 text-white" : "bg-slate-700 text-white"}`}>
            Page {page.pageNumber}
          </span>
          <span className="text-xs font-medium text-slate-500 truncate w-full text-center px-1" title={page.fileName}>
            {page.fileName}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Merge() {
  const [pdfFiles, setPdfFiles] = useState([]);
  const [state, dispatch] = useReducer(editorReducer, initialState);
  
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [previewPage, setPreviewPage] = useState(null);
  const [slideDirection, setSlideDirection] = useState('initial'); 
  const [outputFileName, setOutputFileName] = useState("");

  // Tracking pending deletions to trigger shatter animation
  const [deletingIds, setDeletingIds] = useState([]);
  
  // Tracking successful download to trigger fly-to-corner animation
  const [saveAnimation, setSaveAnimation] = useState(false);

  const { pages, selectedIds } = state.present;
  const inputRef = useRef(null);
  
  const scrollContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [pages, editMode]);

  const navigatePreview = (direction, e) => {
    if (e) e.stopPropagation();
    const currentIndex = pages.findIndex(p => p.id === previewPage.id);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < pages.length) {
      setSlideDirection(direction === 1 ? 'next' : 'prev');
      setPreviewPage(pages[newIndex]);
    }
  };

  useEffect(() => {
    if (!previewPage) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setPreviewPage(null);
      if (e.key === "ArrowLeft") navigatePreview(-1);
      if (e.key === "ArrowRight") navigatePreview(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewPage, pages]);

  const scrollLeft = () => scrollContainerRef.current?.scrollBy({ left: -400, behavior: "smooth" });
  const scrollRight = () => scrollContainerRef.current?.scrollBy({ left: 400, behavior: "smooth" });

  const handleUpload = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.target.files || (e.dataTransfer && e.dataTransfer.files) || []);
    if (!files.length) return;

    setIsUploading(true);
    setTimeout(async () => {
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
      setIsUploading(false);
      setEditMode(true);
    }, 1000); 
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    dispatch({ type: "MOVE_PAGE", payload: { oldIndex: pages.findIndex(p => p.id === active.id), newIndex: pages.findIndex(p => p.id === over.id) } });
  };

  const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
    duration: 250,
    easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  };

  // Intercept the Action to handle the Shatter Delete delay
  const handleAction = (type, payload) => {
    if (type === "DELETE") {
      setDeletingIds(prev => [...prev, ...payload]);
      // Wait for the 600ms CSS animation to finish before removing from React state
      setTimeout(() => {
        dispatch({ type, payload });
        setDeletingIds(prev => prev.filter(id => !payload.includes(id)));
      }, 550);
    } else {
      dispatch({ type, payload });
    }
  };

  const handleMerge = async (mergeOnlySelected = false) => {
    if (pages.length === 0) return;
    setIsMerging(true);
    setProgress(10);
    const targetPages = mergeOnlySelected ? pages.filter(p => selectedIds.includes(p.id)) : pages;
    const formData = new FormData();
    pdfFiles.forEach(file => formData.append("files", file));
    formData.append("order", JSON.stringify(targetPages.map(p => ({ fileIndex: p.fileIndex, pageNumber: p.pageNumber, rotation: p.rotation }))));
    formData.append("metadata", JSON.stringify({ title: outputFileName.trim() }));
    setProgress(40);

    try {
      const response = await fetch("/api/merge/", { method: "POST", body: formData });
      setProgress(80);
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(blob);
      
      // FIXED: Respects user-edited file name for BOTH merge all and merge selected
      let finalDownloadName = outputFileName.trim() ? outputFileName.trim() : "merged_document";
      if (!finalDownloadName.toLowerCase().endsWith('.pdf')) finalDownloadName += ".pdf";
      a.download = finalDownloadName;
      
      a.click();
      setProgress(100);

      // Trigger the success fly-away animation
      setTimeout(() => {
        setIsMerging(false);
        setProgress(0);
        setSaveAnimation(true);
        setTimeout(() => setSaveAnimation(false), 2000); // clear animation state
      }, 500);

    } catch (error) {
      console.error("Merge failed", error);
      alert("Failed to merge documents.");
      setIsMerging(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-12 px-6 relative overflow-hidden">
      
      {/* 🌟 Global Custom Animation Dictionary */}
      <style>{`
        @keyframes flyInFromTopRight {
          0% { transform: translate(50vw, -50vh) scale(0.2) rotate(45deg); opacity: 0; }
          10% { opacity: 1; }
          70% { transform: translate(0px, 0px) scale(1.1) rotate(-5deg); opacity: 1; }
          100% { transform: translate(0px, 0px) scale(1) rotate(0deg); opacity: 0; }
        }
        @keyframes smoothFadeIn {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes slideInRight {
          0% { transform: translateX(100px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInLeft {
          0% { transform: translateX(-100px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeZoom {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        
        /* 🌟 NEW: Popcorn Duplicate Animation */
        @keyframes popcorn {
          0% { transform: scale(0.6) translateY(30px); opacity: 0; }
          40% { transform: scale(1.15) translateY(-40px) rotate(8deg); opacity: 1; }
          60% { transform: scale(0.9) translateY(10px) rotate(-5deg); }
          80% { transform: scale(1.05) translateY(-5px) rotate(2deg); }
          100% { transform: scale(1) translateY(0) rotate(0); opacity: 1; }
        }

        /* 🌟 NEW: Shattered Glass Delete Animation */
        @keyframes shatterGlass {
          0% { transform: scale(1) rotate(0deg); filter: brightness(1) contrast(1); opacity: 1; }
          20% { transform: scale(1.05) skewX(5deg) skewY(-5deg); filter: brightness(1.5) contrast(2) drop-shadow(0 0 15px rgba(255,255,255,0.9)); opacity: 1; }
          40% { transform: scale(0.9) skewX(-15deg) skewY(15deg) rotate(15deg) translateY(20px); opacity: 0.8; }
          100% { transform: scale(0.3) rotate(60deg) translateY(250px); filter: blur(5px); opacity: 0; }
        }

        /* 🌟 NEW: Save/Fly to Top Right Animation */
        @keyframes flyToTopRight {
          0% { top: 50%; left: 50%; transform: translate(-50%, -50%) scale(1); opacity: 0; }
          15% { top: 50%; left: 50%; transform: translate(-50%, -50%) scale(1.3) rotate(-5deg); opacity: 1; filter: drop-shadow(0 20px 30px rgba(0,0,0,0.2)); }
          30% { top: 50%; left: 50%; transform: translate(-50%, -50%) scale(1.2) rotate(0deg); opacity: 1; }
          100% { top: 20px; left: calc(100% - 40px); transform: translate(-50%, -50%) scale(0.1) rotate(20deg); opacity: 0; }
        }
      `}</style>

      {/* 🌟 NEW: Success Save Animation Overlay */}
      {saveAnimation && (
        <div className="fixed inset-0 pointer-events-none z-[200]">
          <div className="absolute animate-[flyToTopRight_1.5s_cubic-bezier(0.55,0.085,0.68,0.53)_forwards] flex flex-col items-center">
            <div className="bg-white p-4 rounded-2xl shadow-2xl border-2 border-blue-500">
              <svg className="w-24 h-24 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5H8l4-4 4 4h-3v5h-2z"/></svg>
            </div>
            <span className="bg-emerald-500 text-white px-6 py-2 rounded-full mt-4 font-extrabold text-lg shadow-xl uppercase tracking-widest">
              Saved!
            </span>
          </div>
        </div>
      )}

      {previewPage && (
        <div className="fixed inset-0 bg-slate-900/95 z-[100] flex flex-col items-center justify-center p-4 sm:p-8 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]" onClick={() => setPreviewPage(null)}>
          <div className="flex justify-between w-full max-w-6xl mb-4 text-white z-10 px-4 sm:px-12 animate-[smoothFadeIn_0.3s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl">{previewPage.fileName} <span className="text-slate-400">| Page {previewPage.pageNumber}</span></h3>
            <button className="text-white hover:text-red-400 font-bold flex items-center gap-2 transition-all active:scale-75" onClick={() => setPreviewPage(null)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> Close
            </button>
          </div>
          
          <div className="relative flex items-center justify-center w-full max-w-6xl flex-1 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button onClick={(e) => navigatePreview(-1, e)} disabled={pages.findIndex(p => p.id === previewPage.id) === 0} className="absolute left-0 sm:-left-6 p-4 text-white/50 hover:text-white disabled:opacity-0 transition-all z-20 hover:scale-125 active:scale-75 focus:outline-none">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div key={previewPage.id} className={`flex items-center justify-center h-full w-full ${slideDirection === 'next' ? 'animate-[slideInRight_0.3s_ease-out]' : slideDirection === 'prev' ? 'animate-[slideInLeft_0.3s_ease-out]' : 'animate-[fadeZoom_0.3s_ease-out]'}`}>
              <img 
                src={previewPage.thumbnail} 
                className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                style={{ transform: `rotate(${previewPage.rotation}deg)` }}
              />
            </div>

            <button onClick={(e) => navigatePreview(1, e)} disabled={pages.findIndex(p => p.id === previewPage.id) === pages.length - 1} className="absolute right-0 sm:-right-6 p-4 text-white/50 hover:text-white disabled:opacity-0 transition-all z-20 hover:scale-125 active:scale-75 focus:outline-none">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          <div className="absolute bottom-6 text-white/40 text-sm pointer-events-none hidden sm:block animate-[smoothFadeIn_0.6s_ease-out]">
            Use arrow keys <kbd className="font-mono bg-white/10 px-1 rounded">←</kbd> <kbd className="font-mono bg-white/10 px-1 rounded">→</kbd> to navigate
          </div>
        </div>
      )}

      {isMerging && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md flex flex-col items-center text-center animate-[fadeZoom_0.3s_ease-out]">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Processing Document</h3>
            <p className="text-slate-500 text-sm mb-6">Applying formatting and merging pages...</p>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white w-full max-w-7xl rounded-3xl shadow-sm border border-slate-200 p-8">
        
        {!editMode && (
          <div className="py-12 relative animate-[smoothFadeIn_0.5s_ease-out]">
            <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-8 text-center">Merge & Reorder PDFs</h1>
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
              onDrop={handleUpload}
              onClick={() => inputRef.current.click()} 
              className={`relative border-2 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all duration-300 group overflow-hidden ${isDragOver ? "border-blue-500 bg-blue-50 scale-[1.02]" : "border-slate-300 hover:border-blue-500 hover:bg-blue-50"}`}
            >
              <input ref={inputRef} type="file" multiple accept="application/pdf" onChange={handleUpload} className="hidden" />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="absolute w-14 h-20 bg-blue-600 rounded-xl shadow-2xl flex items-center justify-center text-white font-bold border-2 border-white" style={{ animation: `flyInFromTopRight 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 0.15}s forwards`, opacity: 0 }}>
                      PDF
                    </div>
                  ))}
                </div>
              )}
              <div className={`transition-opacity duration-300 ${isUploading ? 'opacity-0' : 'opacity-100'}`}>
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                </div>
                <p className="text-slate-700 font-semibold text-xl mb-2">Click or drag to upload PDFs</p>
              </div>
            </div>
          </div>
        )}

        {editMode && (
          <div style={{ animation: 'smoothFadeIn 0.6s ease-out forwards' }}>
            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-8 gap-4 pb-6 border-b border-slate-100 min-h-[60px]">
              
              <div className="flex flex-col gap-3 w-full xl:w-auto">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-800 mr-2">Review Pages</h2>
                  <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
                    <button onClick={() => dispatch({ type: "UNDO" })} disabled={state.past.length === 0} className={`p-1.5 rounded-md flex items-center gap-1 text-sm font-medium transition-all active:scale-90 ${state.past.length === 0 ? "text-slate-400 cursor-not-allowed" : "text-slate-700 hover:bg-white hover:shadow-sm"}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    </button>
                    <button onClick={() => dispatch({ type: "REDO" })} disabled={state.future.length === 0} className={`p-1.5 rounded-md flex items-center gap-1 text-sm font-medium transition-all active:scale-90 ${state.future.length === 0 ? "text-slate-400 cursor-not-allowed" : "text-slate-700 hover:bg-white hover:shadow-sm"}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                    </button>
                  </div>
                  <button onClick={() => handleAction("AUTO_GROUP")} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-all active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg> Auto-Group Sort
                  </button>
                </div>

                {selectedIds.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 bg-blue-50 px-4 py-2 rounded-xl border border-blue-200 animate-[fadeZoom_0.2s_ease-out]">
                    <span className="text-blue-800 font-bold px-2">{selectedIds.length} Selected</span>
                    <div className="w-px h-6 bg-blue-200 mx-1"></div>
                    <button onClick={() => handleAction("ROTATE", selectedIds)} className="text-sm font-medium text-slate-700 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all active:scale-90">Rotate</button>
                    <button onClick={() => handleAction("DUPLICATE", selectedIds)} className="text-sm font-medium text-slate-700 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all active:scale-90">Duplicate</button>
                    <button onClick={() => handleAction("DELETE", selectedIds)} className="text-sm font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all active:scale-90">Delete</button>
                    <button onClick={() => handleAction("SET_SELECTION", [])} className="text-sm font-medium text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-all active:scale-90">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleAction("SET_SELECTION", pages.map(p => p.id))} className="text-sm text-blue-600 font-medium hover:underline transition-all">Select All</button>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 w-full xl:w-auto mt-4 xl:mt-0 items-center">
                {selectedIds.length > 0 && (
                  <button onClick={() => handleMerge(true)} className="px-5 py-3 font-semibold rounded-xl transition-all active:scale-95 flex items-center gap-2 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 animate-[fadeZoom_0.2s_ease-out]">
                      Export Selected ({selectedIds.length})
                  </button>
                )}
                <div className="relative flex items-center">
                  <input type="text" value={outputFileName} onChange={(e) => setOutputFileName(e.target.value)} placeholder="Document Name..." className="bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none w-48 xl:w-64 transition-all" />
                  <span className="absolute right-4 text-slate-400 text-sm font-medium pointer-events-none">.pdf</span>
                </div>
                <button onClick={() => handleMerge(false)} disabled={pages.length === 0} className={`px-6 py-3 font-semibold rounded-xl shadow-md transition-all flex items-center gap-2 justify-center ${pages.length === 0 ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none" : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg active:scale-95"}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  Merge All
                </button>
              </div>
            </div>

            <div className="relative group/canvas bg-slate-50/50 rounded-2xl border border-slate-100">
              
              {canScrollLeft && (
                <button onClick={scrollLeft} className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/95 shadow-xl rounded-full flex items-center justify-center text-slate-700 hover:text-blue-600 hover:scale-110 active:scale-90 border border-slate-200 transition-all backdrop-blur-sm opacity-0 group-hover/canvas:opacity-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}

              <div ref={scrollContainerRef} onScroll={checkScroll} className="flex gap-4 overflow-x-auto pb-6 pt-6 px-6 scroll-smooth [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400">
                {pages.length === 0 ? (
                  <div className="w-full text-center py-12 text-slate-500 font-medium flex flex-col items-center animate-[fadeZoom_0.3s_ease-out]">
                    <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    All pages deleted. Use Undo to revert.
                  </div>
                ) : (
                  <DndContext collisionDetection={closestCenter} onDragStart={(e) => setActiveId(e.active.id)} onDragEnd={handleDragEnd} autoScroll={true}>
                    <SortableContext items={pages.map(p => p.id)} strategy={horizontalListSortingStrategy}>
                      {pages.map((page, index) => (
                        <SortableItem 
                          key={page.id} 
                          page={page} 
                          onAction={handleAction} 
                          isNewFile={index === 0 || pages[index - 1].fileName !== page.fileName} 
                          isSelected={selectedIds.includes(page.id)} 
                          isDeleting={deletingIds.includes(page.id)}
                          onPreview={(page) => { setSlideDirection('initial'); setPreviewPage(page); }} 
                        />
                      ))}
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

              {canScrollRight && (
                <button onClick={scrollRight} className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 bg-white/95 shadow-xl rounded-full flex items-center justify-center text-slate-700 hover:text-blue-600 hover:scale-110 active:scale-90 border border-slate-200 transition-all backdrop-blur-sm opacity-0 group-hover/canvas:opacity-100">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}