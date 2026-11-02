"use client";

import { useEffect, useRef } from "react";
import type { AboutLang } from "./aboutLang";
import { ABOUT_STORY_HTML } from "./aboutStoryContent";
import { mountAboutStory } from "./aboutStoryWidgets";
import "./about-story.css";

export function AboutStory({ lang, fontClassName }: { lang: AboutLang; fontClassName: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const story = mountAboutStory(root);
    let disposeScenes: (() => void) | undefined;
    let cancelled = false;

    import("./aboutStoryScenes")
      .then(({ mountAboutScenes }) => {
        if (!cancelled) disposeScenes = mountAboutScenes(story.context);
      })
      .catch((error: unknown) => {
        console.error("About 3D scenes failed to load", error);
        for (const stage of root.querySelectorAll(".stage3d")) stage.classList.add("nogl");
      });

    return () => {
      cancelled = true;
      disposeScenes?.();
      story.dispose();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      lang={lang}
      className={`about-story ${fontClassName}`}
      // Safe here: source is local static content, not user-generated.
      dangerouslySetInnerHTML={{ __html: ABOUT_STORY_HTML }}
    />
  );
}
