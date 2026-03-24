import { useEffect, useState } from "react";

export const App = () => {
  const [editorLoaded, setEditorLoaded] = useState(false);

  useEffect(() => {
    import("@humansignal/editor").then(() => {
      setEditorLoaded(true);
    }).catch((err) => {
      console.error("Failed to load @humansignal/editor:", err);
    });
  }, []);

  return (
    <div id="playground-root" data-testid="playground-root">
      <h1>Label Studio Playground</h1>
      <p data-testid="editor-status">
        Editor module: {editorLoaded ? "loaded" : "loading..."}
      </p>
    </div>
  );
};
