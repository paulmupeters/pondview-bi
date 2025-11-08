"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyCustomCss } from "@/lib/custom-css";

const CSS_PLACEHOLDER = `:root{
  --background: 0 0% 100%;
  --foreground: oklch(0.1496 0 0);
  --card: oklch(1.0000 0 0);
  /* and more */
}
.dark{
  --background: oklch(0.2156 0.0224 240.6523);
  --foreground: oklch(0.9491 0 0);
  --primary: oklch(0.8280 0.1890 84.4290);
  /* and more */
}`;



export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem("AI_GATEWAY_API_KEY") || "";
    const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
    setApiKey(savedApiKey);
    setCssCode(savedCss);
  }, []);

  // Apply CSS on component mount
  useEffect(() => {
    if (cssCode) {
      applyCustomCss(cssCode);
    }
  }, [cssCode]);

  const handleSaveApiKey = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem("AI_GATEWAY_API_KEY", apiKey);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCss = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem("CUSTOM_CSS", cssCode);
      applyCustomCss(cssCode);
      setIsDialogOpen(false);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground mb-8">
            Manage your application preferences and configuration.
          </p>

          {showSuccessMessage && (
            <div className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200">
              Settings saved successfully!
            </div>
          )}

          {/* API Key Section */}
          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">API Key</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure your AI Gateway API key for enhanced functionality.
                </p>
              </div>

              <div>
                <label
                  htmlFor="api-key"
                  className="text-sm font-medium mb-2 block"
                >
                  AI_GATEWAY_API_KEY
                </label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="mb-4"
                />
                <Button
                  onClick={handleSaveApiKey}
                  disabled={isSaving}
                  className="w-full sm:w-auto"
                >
                  {isSaving ? "Saving..." : "Save API Key"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Style Editor Section */}
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Custom Styles</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Customize the appearance of the application using CSS
                  variables.
                </p>
              </div>

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Edit Styles</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Custom CSS</DialogTitle>
                    <DialogDescription>
                      Paste your custom CSS here. Changes will be applied
                      immediately.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <Textarea
                      value={cssCode}
                      onChange={(e) => setCssCode(e.target.value)}
                      placeholder={CSS_PLACEHOLDER}
                      className="font-mono text-sm min-h-[400px]"
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSaveCss} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Styles"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {cssCode && (
                <div className="p-3 rounded-lg bg-muted text-sm">
                  <p className="font-medium mb-1">Current CSS:</p>
                  <pre className="text-xs overflow-auto max-h-40 bg-background p-2 rounded border">
                    {cssCode}
                  </pre>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
