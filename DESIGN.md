---
version: "alpha"
name: "Lumina Brand Guidelines"
description: "Lumina Brand Content Section is designed for structuring a full-width content block for modern web pages. Key features include reusable structure, responsive behavior, and production-ready presentation. It is suitable for component libraries and responsive product interfaces."
colors:
  primary: "#475569"
  secondary: "#0F172A"
  tertiary: "#FDBA74"
  neutral: "#11151D"
  background: "#11151D"
  surface: "#E2E8F0"
  text-primary: "#64748B"
  text-secondary: "#FFFFFF"
  border: "#FFFFFF"
  accent: "#475569"
typography:
  display-lg:
    fontFamily: "Inter"
    fontSize: "96px"
    fontWeight: 500
    lineHeight: "96px"
    letterSpacing: "-0.025em"
  body-md:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 300
    lineHeight: "20px"
spacing:
  base: "6px"
  sm: "1px"
  md: "3px"
  lg: "6px"
  xl: "8px"
  gap: "4px"
  card-padding: "8px"
  section-padding: "24px"
components:
  card:
    backgroundColor: "{colors.neutral}"
    rounded: "15px"
    padding: "48px"
---

## Overview

- **Composition cues:**
  - Layout: Grid
  - Content Width: Bounded
  - Framing: Framed
  - Grid: Strong

## Colors

The color system uses dark mode with #475569 as the main accent and #11151D as the neutral foundation.

- **Primary (#475569):** Main accent and emphasis color.
- **Secondary (#0F172A):** Supporting accent for secondary emphasis.
- **Tertiary (#FDBA74):** Reserved accent for supporting contrast moments.
- **Neutral (#11151D):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #11151D; Surface: #E2E8F0; Text Primary: #64748B; Text Secondary: #FFFFFF; Border: #FFFFFF; Accent: #475569

## Typography

Typography relies on Inter across display, body, and utility text.

- **Display (`display-lg`):** Inter, 96px, weight 500, line-height 96px, letter-spacing -0.025em.
- **Body (`body-md`):** Inter, 14px, weight 300, line-height 20px.

## Layout

Layout follows a grid composition with reusable spacing tokens. Preserve the grid, bounded structural frame before changing ornament or component styling. Use 6px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a grid / bounded composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Grid
- **Content width:** Bounded
- **Base unit:** 6px
- **Scale:** 1px, 3px, 6px, 8px, 9.6px, 16px, 19.2px, 24px
- **Section padding:** 24px, 32px, 40px, 48px
- **Card padding:** 8px, 16px, 32px, 40px
- **Gaps:** 4px, 8px, 16px, 24px

## Elevation & Depth

Depth is communicated through outlined, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as outlined first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Outlined
- **Borders:** 0.67px #FFFFFF; 0.67px #6366F1

### Techniques
- **Gradient border shell:** Use a thin gradient border shell around the main card. Wrap the surface in an outer shell with 1px padding and a 16px radius. Drive the shell with linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 100%) so the edge reads like premium depth instead of a flat stroke. Keep the actual stroke understated so the gradient shell remains the hero edge treatment. Inset the real content surface inside the wrapper with a slightly smaller radius so the gradient only appears as a hairline frame.

## Shapes

Shapes rely on a tight radius system anchored by 8px and scaled across cards, buttons, and supporting surfaces. Icon geometry should stay compatible with that soft-to-controlled silhouette.

Use the radius family intentionally: larger surfaces can open up, but controls and badges should stay within the same rounded DNA instead of inventing sharper or pill-only exceptions.

- **Corner radii:** 8px, 15px, 16px

## Components

Reuse the existing card surface recipe for content blocks.

### Cards and Surfaces
- **Card surface:** background #11151D, border 0px solid rgb(229, 231, 235), radius 15px, padding 48px, shadow none.
- **Card surface:** background #11151D, border 0px solid rgb(229, 231, 235), radius 15px, padding 40px, shadow none.
- **Card surface:** background #E2E8F0, border 0px solid rgb(229, 231, 235), radius 0px, padding 16px, shadow none.

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 6px rhythm.
- Do reuse the Outlined surface treatment consistently across cards and controls.
- Do keep corner radii within the detected 8px, 15px, 16px family.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't exceed the detected minimal motion intensity without a deliberate reason.

## Motion

Motion stays restrained and interface-led across text, layout, and scroll transitions. Timing clusters around 150ms. Easing favors ease and cubic-bezier(0.4. Scroll choreography uses GSAP ScrollTrigger for section reveals and pacing.

**Motion Level:** minimal

**Durations:** 150ms

**Easings:** ease, cubic-bezier(0.4, 0, 0.2, 1)

**Scroll Patterns:** gsap-scrolltrigger

## WebGL

Reconstruct the graphics as a inset canvas accent using webgl, custom shaders. The effect should read as technical, meditative, and atmospheric: dot-matrix particle field with deep blue and sparse spacing. Build it from dot particles + soft depth fade so the effect reads clearly. Animate it as slow breathing pulse. Interaction can react to the pointer, but only as a subtle drift. Preserve dom fallback.

**Id:** webgl

**Label:** WebGL

**Stack:** WebGL

**Insights:**
  - **Scene:**
    - **Value:** Inset canvas accent
  - **Effect:**
    - **Value:** Dot-matrix particle field
  - **Primitives:**
    - **Value:** Dot particles + soft depth fade
  - **Motion:**
    - **Value:** Slow breathing pulse
  - **Interaction:**
    - **Value:** Pointer-reactive drift
  - **Render:**
    - **Value:** WebGL, custom shaders

**Techniques:** Dot matrix, Breathing pulse, Pointer parallax, Shader gradients, Noise fields

**Code Evidence:**
  - **HTML reference:**
    - **Language:** html
    - **Snippet:**
      ```html
      <div class="flex flex-col justify-between p-8 md:p-12" style="background: #11151D; border-radius: 15px; height: 100%; position: relative; overflow: hidden;">
          <!-- WebGL Canvas Background -->
          <canvas id="webgl-canvas" class="absolute inset-0 w-full h-full z-0 opacity-80 mix-blend-screen pointer-events-none"></canvas>

          <!-- Content -->
      ```
