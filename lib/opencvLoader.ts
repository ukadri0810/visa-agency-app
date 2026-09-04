let loadingPromise: Promise<void> | null = null;

export function loadOpenCv(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Client only"));
  if ((window as any).cv?.Mat) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;
    script.onload = () => {
      const cv = (window as any).cv;
      if (cv.getBuildInformation) {
        resolve();
      } else {
        cv.onRuntimeInitialized = () => resolve();
      }
    };
    script.onerror = () => reject(new Error("Failed to load OpenCV"));
    document.body.appendChild(script);
  });

  return loadingPromise;
}
