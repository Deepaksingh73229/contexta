'use client'

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ingestDoc } from "@/services/operations/ingestAPI";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle,
  Loader2,
  ShieldCheck,
  Database
} from 'lucide-react';

const UploadPage = () => {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const newFiles = selectedFiles.map(file => ({
      file, // The actual raw JS File object
      id: Math.random().toString(36).substring(7),
      status: 'pending' 
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id) => {
    setFiles(files.filter(f => f.id !== id));
  };

  // The corrected processing function
  const handleProcessFiles = async () => {
    // 1. Only process files that are currently 'pending'
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);
    setProgress(0);

    // 2. Loop through each pending file and send it to the backend one by one
    for (let i = 0; i < pendingFiles.length; i++) {
      const currentItem = pendingFiles[i];
      const fileName = currentItem.file.name;
      
      setStatusText(`Uploading & Chunking ${fileName}...`);
      
      // Calculate a base progress for the UI
      const baseProgress = ((i) / pendingFiles.length) * 100;
      setProgress(baseProgress + 10); // Show a little movement

      // 3. Create fresh FormData for this specific file
      const formData = new FormData();
      formData.append("file", currentItem.file);

      try {
        // 4. Send the actual API request
        setStatusText(`Generating Vectors for ${fileName}...`);
        setProgress(baseProgress + 50);
        
        await ingestDoc(formData);

        // 5. If successful, update just this file's status to 'completed'
        setFiles(prev => prev.map(f => 
          f.id === currentItem.id ? { ...f, status: 'completed' } : f
        ));
        
        setProgress(((i + 1) / pendingFiles.length) * 100);
      } catch (error) {
        console.error(`Error during ingestion for ${fileName}:`, error);
        setStatusText(`Error processing ${fileName}`);
        // Optionally update the status to 'error' if you want to show a red X
      }
    }

    // 6. Finish the UI state
    setStatusText("Ingestion Complete!");
    setProgress(100);
    
    // Give the user a second to see the 100% success state before resetting
    setTimeout(() => {
      setIsProcessing(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 md:p-12 font-sans text-zinc-950 dark:text-zinc-50">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header Section */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Data Ingestion</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Upload institutional records, guidelines, and reports to train your local knowledge base.
          </p>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl">Upload Documents</CardTitle>
                <CardDescription className="mt-1.5">Supports PDF up to 50MB.</CardDescription>
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900 gap-1.5 py-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                100% Local Processing
              </Badge>
            </div>
          </CardHeader>
          <CardContent>

            {/* Drag & Drop Zone */}
            <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-10 flex flex-col items-center justify-center bg-zinc-50/50 dark:bg-zinc-950/50 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50 transition-colors relative group">
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isProcessing}
                accept=".pdf"
              />
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 font-medium mb-1">
                Drag & drop files here
              </p>
              <p className="text-zinc-500 dark:text-zinc-500 text-sm">
                or click to browse your computer
              </p>
            </div>

            {/* File List & Progress */}
            {files.length > 0 && (
              <div className="mt-8 space-y-4">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Database className="w-4 h-4 text-zinc-500" />
                  Processing Queue ({files.length})
                </h3>

                <div className="space-y-3">
                  {files.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-medium truncate">{item.file.name}</p>
                          <p className="text-xs text-zinc-500">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {item.status === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                        {item.status === 'pending' && !isProcessing && (
                          <button onClick={() => removeFile(item.id)} className="text-zinc-400 hover:text-red-500 transition-colors">
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Processing State UI */}
                {isProcessing && (
                  <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 p-4 rounded-xl mt-6 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-medium">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {statusText}
                      </div>
                      <span className="text-indigo-700 dark:text-indigo-300 font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2 bg-indigo-200 dark:bg-indigo-950" />
                  </div>
                )}

                {/* Action Button */}
                {!isProcessing && files.some(f => f.status === 'pending') && (
                  <Button
                    onClick={handleProcessFiles}
                    className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 h-12 text-base"
                  >
                    <Database className="w-5 h-5 mr-2" />
                    Ingest to Knowledge Base
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UploadPage;