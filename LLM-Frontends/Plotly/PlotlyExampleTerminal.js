// ==UserScript==
// @name         Plotly Reference Terminal
// @namespace    plotly-reference
// @version      1.0.0
// @description  Interactive Plotly documentation with live rendered examples - Terminal Style
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @match        https://chat.deepseek.com/*
// @match        https://arena.ai/*
// @grant        none
// @require      https://cdn.plot.ly/plotly-2.35.0.min.js
// ==/UserScript==

(function () {
    'use strict';

    const CSS = `
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');

        .plref-toggle{position:fixed;bottom:20px;right:20px;z-index:99998;width:50px;height:50px;background:#0a0a0a;border:1px solid #00ff41;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:20px;color:#00ff41;transition:all .2s;box-shadow:0 0 20px rgba(0,255,65,.2)}
        .plref-toggle:hover{background:#00ff41;color:#0a0a0a;box-shadow:0 0 30px rgba(0,255,65,.5)}

        .plref-modal{position:fixed;inset:0;z-index:99999;background:#0a0a0a;display:none;flex-direction:column;font-family:'JetBrains Mono',monospace;color:#00ff41}
        .plref-modal.active{display:flex}

        .plref-header{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#0f0f0f;border-bottom:1px solid #1a1a1a}
        .plref-title{font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
        .plref-title span{color:#00ff41}
        .plref-close{background:none;border:1px solid #333;color:#888;width:30px;height:30px;cursor:pointer;font-size:16px;transition:all .15s}
        .plref-close:hover{border-color:#ff4141;color:#ff4141}

        .plref-container{display:flex;flex:1;overflow:hidden}

        .plref-sidebar{width:240px;background:#0f0f0f;border-right:1px solid #1a1a1a;overflow-y:auto;flex-shrink:0}
        .plref-nav-section{border-bottom:1px solid #1a1a1a}
        .plref-nav-title{padding:12px 16px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#555;background:#080808}
        .plref-nav-item{padding:10px 16px;font-size:12px;color:#888;cursor:pointer;transition:all .1s;border-left:2px solid transparent}
        .plref-nav-item:hover{background:#1a1a1a;color:#00ff41}
        .plref-nav-item.active{background:#0a1a0f;color:#00ff41;border-left-color:#00ff41}
        .plref-nav-item code{font-size:11px;color:#00ff41;background:#1a1a1a;padding:1px 4px;border-radius:2px}

        .plref-content{flex:1;overflow-y:auto;padding:24px;background:#0a0a0a}

        .plref-section{margin-bottom:40px}
        .plref-section-title{font-size:16px;font-weight:700;color:#00ff41;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #1a1a1a}
        .plref-section-title::before{content:'> ';color:#555}

        .plref-desc{font-size:12px;line-height:1.7;color:#888;margin-bottom:16px}
        .plref-desc code{color:#00ff41;background:#1a1a1a;padding:1px 6px;border-radius:2px;font-size:11px}
        .plref-desc strong{color:#fff}

        .plref-props{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:4px;overflow:hidden;margin-bottom:16px}
        .plref-prop{display:flex;border-bottom:1px solid #1a1a1a;font-size:11px}
        .plref-prop:last-child{border-bottom:none}
        .plref-prop-name{width:160px;padding:8px 12px;background:#080808;color:#00ff41;flex-shrink:0;border-right:1px solid #1a1a1a}
        .plref-prop-val{padding:8px 12px;color:#888;flex:1}
        .plref-prop-val code{color:#f59e0b;background:#1a1a0a;padding:0 4px;border-radius:2px}

        .plref-code{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:4px;padding:16px;margin-bottom:16px;overflow-x:auto}
        .plref-code pre{margin:0;font-size:11px;line-height:1.6;color:#ccc}
        .plref-code .key{color:#00ff41}
        .plref-code .str{color:#f59e0b}
        .plref-code .num{color:#3b82f6}
        .plref-code .bool{color:#ec4899}

        .plref-chart{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:4px;padding:16px;margin-bottom:16px;min-height:300px}
        .plref-chart-title{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#555;margin-bottom:12px}
        .plref-chart-container{width:100%;height:280px}

        .plref-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:20px}

        .plref-color-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:16px}
        .plref-color{display:flex;align-items:center;gap:8px;padding:8px;background:#0f0f0f;border:1px solid #1a1a1a;border-radius:4px;font-size:10px}
        .plref-color-swatch{width:20px;height:20px;border-radius:2px;flex-shrink:0}
        .plref-color-hex{color:#888}

        .plref-tip{background:#0a1a0f;border:1px solid #00ff41;border-radius:4px;padding:12px 16px;margin-bottom:16px;font-size:11px;color:#00ff41}
        .plref-tip::before{content:'TIP: ';font-weight:700}

        .plref-warn{background:#1a0a0a;border:1px solid #ff4141;border-radius:4px;padding:12px 16px;margin-bottom:16px;font-size:11px;color:#ff4141}
        .plref-warn::before{content:'WARN: ';font-weight:700}

        .plref-tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #1a1a1a;padding-bottom:8px}
        .plref-tab{padding:6px 12px;font-size:11px;background:#0f0f0f;border:1px solid #1a1a1a;color:#888;cursor:pointer;transition:all .1s}
        .plref-tab:hover{color:#00ff41;border-color:#00ff41}
        .plref-tab.active{background:#0a1a0f;color:#00ff41;border-color:#00ff41}

        .plref-sidebar::-webkit-scrollbar,.plref-content::-webkit-scrollbar{width:6px}
        .plref-sidebar::-webkit-scrollbar-track,.plref-content::-webkit-scrollbar-track{background:#0a0a0a}
        .plref-sidebar::-webkit-scrollbar-thumb,.plref-content::-webkit-scrollbar-thumb{background:#1a1a1a;border-radius:3px}
        .plref-sidebar::-webkit-scrollbar-thumb:hover,.plref-content::-webkit-scrollbar-thumb:hover{background:#2a2a2a}

        .plref-chart .modebar{display:none!important}
        .plref-chart .plotly .main-svg{background:transparent!important}
    `;

    const COLORS = [
        { hex: '#00ff41', name: 'Terminal Green' },
        { hex: '#3b82f6', name: 'Blue' },
        { hex: '#ef4444', name: 'Red' },
        { hex: '#10b981', name: 'Emerald' },
        { hex: '#f59e0b', name: 'Amber' },
        { hex: '#8b5cf6', name: 'Violet' },
        { hex: '#06b6d4', name: 'Cyan' },
        { hex: '#ec4899', name: 'Pink' },
        { hex: '#f97316', name: 'Orange' },
        { hex: '#14b8a6', name: 'Teal' },
        { hex: '#a855f7', name: 'Purple' },
        { hex: '#facc15', name: 'Yellow' }
    ];

    const CHART_TYPES = {
        scatter: {
            name: 'Scatter / Line',
            desc: 'Punkte, Linien oder kombinierte Darstellungen. Der vielseitigste Chart-Typ für Zeitreihen, Korrelationen und Trends.',
            props: [
                ['type', '"scatter"'],
                ['mode', '"lines" | "markers" | "lines+markers" | "text" | "none"'],
                ['x / y', 'Array von Werten'],
                ['name', 'String für Legende'],
                ['marker', '{ color, size, symbol, opacity, line }'],
                ['line', '{ color, width, dash, shape }'],
                ['fill', '"none" | "tozeroy" | "tozerox" | "tonexty" | "tonextx"'],
                ['hovertemplate', 'Format-String für Tooltip']
            ],
            example: {
                data: [{
                    type: 'scatter', mode: 'lines+markers',
                    x: [1, 2, 3, 4, 5, 6, 7, 8],
                    y: [10, 15, 13, 17, 22, 19, 25, 28],
                    name: 'Dataset A',
                    marker: { color: '#00ff41', size: 8 },
                    line: { width: 2, shape: 'spline' }
                }, {
                    type: 'scatter', mode: 'lines+markers',
                    x: [1, 2, 3, 4, 5, 6, 7, 8],
                    y: [8, 12, 9, 14, 18, 15, 20, 22],
                    name: 'Dataset B',
                    marker: { color: '#3b82f6', size: 8 },
                    line: { width: 2, dash: 'dash' }
                }],
                layout: { title: { text: 'Scatter Plot Example' } }
            }
        },
        bar: {
            name: 'Bar Chart',
            desc: 'Balken- und Säulendiagramme für kategorische Vergleiche. Unterstützt vertikale, horizontale, gestapelte und gruppierte Darstellung.',
            props: [
                ['type', '"bar"'],
                ['orientation', '"v" (vertikal) | "h" (horizontal)'],
                ['x / y', 'Kategorien und Werte'],
                ['marker', '{ color, line, opacity }'],
                ['text', 'Array für Bar-Labels'],
                ['textposition', '"inside" | "outside" | "auto" | "none"'],
                ['width', 'Breite der Bars (0-1)']
            ],
            example: {
                data: [{
                    type: 'bar',
                    x: ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun'],
                    y: [45, 62, 55, 78, 82, 95],
                    name: '2024',
                    marker: { color: '#00ff41' }
                }, {
                    type: 'bar',
                    x: ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun'],
                    y: [38, 48, 52, 65, 70, 80],
                    name: '2023',
                    marker: { color: '#3b82f6' }
                }],
                layout: { title: { text: 'Bar Chart Example' }, barmode: 'group' }
            }
        },
        barh: {
            name: 'Horizontal Bar',
            desc: 'Horizontale Balkendiagramme - ideal für Rankings und lange Kategorienamen.',
            props: [
                ['type', '"bar"'],
                ['orientation', '"h"'],
                ['x', 'Werte (numerisch)'],
                ['y', 'Kategorien (strings)']
            ],
            example: {
                data: [{
                    type: 'bar', orientation: 'h',
                    y: ['Python', 'JavaScript', 'TypeScript', 'Go', 'Rust'],
                    x: [92, 85, 78, 65, 58],
                    marker: {
                        color: ['#00ff41', '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b']
                    },
                    text: ['92%', '85%', '78%', '65%', '58%'],
                    textposition: 'auto'
                }],
                layout: { title: { text: 'Horizontal Bar Example' } }
            }
        },
        pie: {
            name: 'Pie / Donut',
            desc: 'Kreisdiagramme für Anteile am Ganzen. Mit hole > 0 wird es zum Donut-Chart.',
            props: [
                ['type', '"pie"'],
                ['labels', 'Array der Kategorien'],
                ['values', 'Array der Werte'],
                ['hole', '0 bis 0.9 (0 = Pie, >0 = Donut)'],
                ['textinfo', '"label" | "percent" | "value" | Kombinationen'],
                ['textposition', '"inside" | "outside" | "auto"'],
                ['marker.colors', 'Array von Farben'],
                ['pull', 'Array oder Zahl für Explosion']
            ],
            example: {
                data: [{
                    type: 'pie',
                    labels: ['Desktop', 'Mobile', 'Tablet', 'Other'],
                    values: [45, 35, 15, 5],
                    hole: 0.45,
                    marker: {
                        colors: ['#00ff41', '#3b82f6', '#f59e0b', '#8b5cf6'],
                        line: { color: '#0a0a0a', width: 2 }
                    },
                    textinfo: 'label+percent',
                    textfont: { color: '#fff', size: 11 }
                }],
                layout: { title: { text: 'Donut Chart Example' } }
            }
        },
        heatmap: {
            name: 'Heatmap',
            desc: 'Farbkodierte Matrix zur Darstellung von Werten über zwei Dimensionen. Ideal für Korrelationsmatrizen.',
            props: [
                ['type', '"heatmap"'],
                ['x / y', 'Achsenbeschriftungen'],
                ['z', '2D-Array der Werte'],
                ['colorscale', '"Viridis" | "Plasma" | "RdBu" | Custom'],
                ['showscale', 'true | false'],
                ['zmin / zmax', 'Farbskala-Grenzen'],
                ['hoverongaps', 'true | false']
            ],
            example: {
                data: [{
                    type: 'heatmap',
                    x: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                    y: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                    z: [
                        [12, 8, 15, 20, 18],
                        [5, 14, 22, 17, 10],
                        [18, 25, 8, 12, 28],
                        [10, 16, 19, 23, 15]
                    ],
                    colorscale: [
                        [0, '#0a0a0a'],
                        [0.5, '#00ff41'],
                        [1, '#fff']
                    ],
                    showscale: true
                }],
                layout: { title: { text: 'Heatmap Example' } }
            }
        },
        histogram: {
            name: 'Histogram',
            desc: 'Häufigkeitsverteilung von Daten. Automatische Binning oder manuelle Konfiguration.',
            props: [
                ['type', '"histogram"'],
                ['x', 'Array der Rohdaten'],
                ['nbinsx', 'Anzahl der Bins'],
                ['histnorm', '"" | "percent" | "probability" | "density"'],
                ['cumulative', '{ enabled: true }'],
                ['marker', '{ color, line }']
            ],
            example: {
                data: [{
                    type: 'histogram',
                    x: Array.from({ length: 500 }, () => Math.random() * 100 + Math.random() * 50),
                    nbinsx: 30,
                    marker: {
                        color: '#00ff41',
                        line: { color: '#0a0a0a', width: 1 }
                    },
                    opacity: 0.8
                }],
                layout: { title: { text: 'Histogram Example' }, bargap: 0.05 }
            }
        },
        box: {
            name: 'Box Plot',
            desc: 'Statistische Verteilung mit Median, Quartilen und Ausreißern.',
            props: [
                ['type', '"box"'],
                ['y', 'Array der Werte'],
                ['name', 'Kategoriename'],
                ['boxpoints', '"all" | "outliers" | "suspectedoutliers" | false'],
                ['jitter', '0 bis 1 für Punktstreuung'],
                ['whiskerwidth', 'Breite der Whisker'],
                ['marker', '{ color, outliercolor }']
            ],
            example: {
                data: [
                    { type: 'box', y: Array.from({ length: 50 }, () => Math.random() * 20 + 10), name: 'Group A', marker: { color: '#00ff41' }, boxpoints: 'outliers' },
                    { type: 'box', y: Array.from({ length: 50 }, () => Math.random() * 30 + 15), name: 'Group B', marker: { color: '#3b82f6' }, boxpoints: 'outliers' },
                    { type: 'box', y: Array.from({ length: 50 }, () => Math.random() * 25 + 20), name: 'Group C', marker: { color: '#f59e0b' }, boxpoints: 'outliers' }
                ],
                layout: { title: { text: 'Box Plot Example' } }
            }
        },
        violin: {
            name: 'Violin Plot',
            desc: 'Kombination aus Box Plot und Kernel Density. Zeigt die Verteilungsform.',
            props: [
                ['type', '"violin"'],
                ['y', 'Array der Werte'],
                ['box', '{ visible: true }'],
                ['meanline', '{ visible: true }'],
                ['side', '"both" | "positive" | "negative"'],
                ['points', '"all" | "outliers" | false']
            ],
            example: {
                data: [
                    { type: 'violin', y: Array.from({ length: 100 }, () => Math.random() * 20 + 10), name: 'Set A', fillcolor: 'rgba(0,255,65,0.3)', line: { color: '#00ff41' }, box: { visible: true }, meanline: { visible: true } },
                    { type: 'violin', y: Array.from({ length: 100 }, () => Math.random() * 30 + 20), name: 'Set B', fillcolor: 'rgba(59,130,246,0.3)', line: { color: '#3b82f6' }, box: { visible: true }, meanline: { visible: true } }
                ],
                layout: { title: { text: 'Violin Plot Example' } }
            }
        },
        area: {
            name: 'Area Chart',
            desc: 'Gefüllte Flächen unter Linien. Ideal für kumulative Daten und Zeitreihenvergleiche.',
            props: [
                ['type', '"scatter"'],
                ['fill', '"tozeroy" | "tonexty"'],
                ['fillcolor', 'RGBA-Farbe für Transparenz'],
                ['stackgroup', 'String für gestapelte Areas'],
                ['mode', '"lines" (ohne Marker für cleane Areas)']
            ],
            example: {
                data: [{
                    type: 'scatter', mode: 'lines', fill: 'tozeroy',
                    x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    y: [5, 8, 12, 10, 15, 18, 22, 20, 25, 28],
                    name: 'Revenue',
                    line: { color: '#00ff41', width: 2 },
                    fillcolor: 'rgba(0,255,65,0.2)'
                }, {
                    type: 'scatter', mode: 'lines', fill: 'tozeroy',
                    x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    y: [3, 5, 8, 6, 10, 12, 15, 14, 18, 20],
                    name: 'Profit',
                    line: { color: '#3b82f6', width: 2 },
                    fillcolor: 'rgba(59,130,246,0.2)'
                }],
                layout: { title: { text: 'Area Chart Example' } }
            }
        },
        scatter3d: {
            name: 'Scatter 3D',
            desc: '3D-Punktwolken mit interaktiver Rotation. Für dreidimensionale Datenexploration.',
            props: [
                ['type', '"scatter3d"'],
                ['mode', '"markers" | "lines" | "lines+markers"'],
                ['x / y / z', '3 Arrays für die Koordinaten'],
                ['marker', '{ size, color, colorscale, opacity }'],
                ['line', '{ color, width }']
            ],
            example: {
                data: [{
                    type: 'scatter3d', mode: 'markers',
                    x: Array.from({ length: 100 }, () => Math.random() * 10),
                    y: Array.from({ length: 100 }, () => Math.random() * 10),
                    z: Array.from({ length: 100 }, () => Math.random() * 10),
                    marker: {
                        size: 4,
                        color: Array.from({ length: 100 }, () => Math.random() * 10),
                        colorscale: [[0, '#00ff41'], [1, '#3b82f6']],
                        opacity: 0.8
                    }
                }],
                layout: {
                    title: { text: '3D Scatter Example' },
                    scene: {
                        xaxis: { title: 'X', gridcolor: '#1a1a1a', zerolinecolor: '#333' },
                        yaxis: { title: 'Y', gridcolor: '#1a1a1a', zerolinecolor: '#333' },
                        zaxis: { title: 'Z', gridcolor: '#1a1a1a', zerolinecolor: '#333' },
                        bgcolor: '#0a0a0a'
                    }
                }
            }
        },
        surface: {
            name: 'Surface 3D',
            desc: '3D-Oberflächen für kontinuierliche Funktionen und Topographien.',
            props: [
                ['type', '"surface"'],
                ['z', '2D-Array der Höhenwerte'],
                ['x / y', 'Optionale Achsenwerte'],
                ['colorscale', 'Farbskala'],
                ['contours', 'Konturlinien-Einstellungen'],
                ['opacity', '0 bis 1']
            ],
            example: {
                data: [{
                    type: 'surface',
                    z: Array.from({ length: 25 }, (_, i) =>
                        Array.from({ length: 25 }, (_, j) =>
                            Math.sin(i / 3) * Math.cos(j / 3) * 5
                        )
                    ),
                    colorscale: [[0, '#0a0a0a'], [0.5, '#00ff41'], [1, '#fff']],
                    contours: {
                        z: { show: true, usecolormap: true, highlightcolor: '#fff', project: { z: true } }
                    }
                }],
                layout: {
                    title: { text: '3D Surface Example' },
                    scene: { bgcolor: '#0a0a0a' }
                }
            }
        },
        contour: {
            name: 'Contour Plot',
            desc: '2D-Konturlinien für 3D-Daten. Topographische Karten und Dichte-Visualisierung.',
            props: [
                ['type', '"contour"'],
                ['z', '2D-Array der Werte'],
                ['colorscale', 'Farbskala'],
                ['contours', '{ coloring, showlines, size }'],
                ['line', '{ smoothing, width }'],
                ['ncontours', 'Anzahl der Konturlinien']
            ],
            example: {
                data: [{
                    type: 'contour',
                    z: Array.from({ length: 30 }, (_, i) =>
                        Array.from({ length: 30 }, (_, j) =>
                            Math.sin(i / 4) * Math.cos(j / 4) * 10 + Math.sin((i + j) / 6) * 5
                        )
                    ),
                    colorscale: [[0, '#0a0a0a'], [0.5, '#00ff41'], [1, '#fff']],
                    contours: { coloring: 'heatmap' },
                    line: { smoothing: 0.85 }
                }],
                layout: { title: { text: 'Contour Plot Example' } }
            }
        },
        sankey: {
            name: 'Sankey Diagram',
            desc: 'Flussdiagramme für Energie, Geld oder Prozessflüsse zwischen Knoten.',
            props: [
                ['type', '"sankey"'],
                ['orientation', '"h" | "v"'],
                ['node', '{ label, color, pad, thickness }'],
                ['link', '{ source, target, value, color }']
            ],
            example: {
                data: [{
                    type: 'sankey', orientation: 'h',
                    node: {
                        pad: 15, thickness: 20,
                        label: ['Source A', 'Source B', 'Process', 'Output X', 'Output Y'],
                        color: ['#00ff41', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']
                    },
                    link: {
                        source: [0, 0, 1, 1, 2, 2],
                        target: [2, 2, 2, 2, 3, 4],
                        value: [20, 10, 15, 25, 40, 30],
                        color: ['rgba(0,255,65,0.4)', 'rgba(0,255,65,0.4)', 'rgba(59,130,246,0.4)', 'rgba(59,130,246,0.4)', 'rgba(139,92,246,0.4)', 'rgba(139,92,246,0.4)']
                    }
                }],
                layout: { title: { text: 'Sankey Diagram Example' } }
            }
        },
        treemap: {
            name: 'Treemap',
            desc: 'Hierarchische Daten als verschachtelte Rechtecke. Größe = Wert.',
            props: [
                ['type', '"treemap"'],
                ['labels', 'Array der Namen'],
                ['parents', 'Array der Parent-Namen'],
                ['values', 'Array der Werte (optional)'],
                ['textinfo', '"label" | "value" | "percent"'],
                ['marker', '{ colors, line }'],
                ['branchvalues', '"total" | "remainder"']
            ],
            example: {
                data: [{
                    type: 'treemap',
                    labels: ['All', 'Tech', 'Finance', 'Health', 'Apple', 'Google', 'Bank A', 'Bank B', 'Pharma', 'Biotech'],
                    parents: ['', 'All', 'All', 'All', 'Tech', 'Tech', 'Finance', 'Finance', 'Health', 'Health'],
                    values: [0, 0, 0, 0, 40, 35, 25, 20, 30, 15],
                    marker: {
                        colors: ['#0a0a0a', '#00ff41', '#3b82f6', '#f59e0b', '#00ff41', '#00ff41', '#3b82f6', '#3b82f6', '#f59e0b', '#f59e0b'],
                        line: { color: '#0a0a0a', width: 2 }
                    },
                    textfont: { color: '#fff' }
                }],
                layout: { title: { text: 'Treemap Example' } }
            }
        },
        sunburst: {
            name: 'Sunburst',
            desc: 'Hierarchische Daten als konzentrische Ringe. Interaktiv drill-down fähig.',
            props: [
                ['type', '"sunburst"'],
                ['labels', 'Array der Namen'],
                ['parents', 'Array der Parent-Namen'],
                ['values', 'Array der Werte'],
                ['branchvalues', '"total" | "remainder"'],
                ['insidetextorientation', '"horizontal" | "radial" | "tangential"']
            ],
            example: {
                data: [{
                    type: 'sunburst',
                    labels: ['Total', 'A', 'B', 'C', 'A1', 'A2', 'B1', 'B2', 'C1'],
                    parents: ['', 'Total', 'Total', 'Total', 'A', 'A', 'B', 'B', 'C'],
                    values: [100, 40, 35, 25, 25, 15, 20, 15, 25],
                    marker: {
                        colors: ['#1a1a1a', '#00ff41', '#3b82f6', '#f59e0b', '#00ff41', '#00ff41', '#3b82f6', '#3b82f6', '#f59e0b'],
                        line: { color: '#0a0a0a', width: 2 }
                    },
                    textfont: { color: '#fff' }
                }],
                layout: { title: { text: 'Sunburst Example' } }
            }
        },
        funnel: {
            name: 'Funnel',
            desc: 'Trichterdiagramm für Conversion-Funnels und Prozess-Phasen.',
            props: [
                ['type', '"funnel"'],
                ['x', 'Werte pro Stufe'],
                ['y', 'Stufennamen'],
                ['textinfo', '"value+percent initial"'],
                ['marker', '{ color }'],
                ['connector', '{ line }']
            ],
            example: {
                data: [{
                    type: 'funnel',
                    y: ['Visitors', 'Signups', 'Trial', 'Paid', 'Retained'],
                    x: [10000, 5000, 2500, 1000, 800],
                    textinfo: 'value+percent initial',
                    marker: {
                        color: ['#00ff41', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']
                    },
                    connector: { line: { color: '#333', width: 2 } }
                }],
                layout: { title: { text: 'Funnel Chart Example' } }
            }
        },
        waterfall: {
            name: 'Waterfall',
            desc: 'Zeigt kumulative Effekte von positiven und negativen Werten.',
            props: [
                ['type', '"waterfall"'],
                ['x', 'Kategorien'],
                ['y', 'Werte (positiv/negativ)'],
                ['measure', '"relative" | "total" | "absolute"'],
                ['increasing', '{ marker: { color } }'],
                ['decreasing', '{ marker: { color } }'],
                ['totals', '{ marker: { color } }']
            ],
            example: {
                data: [{
                    type: 'waterfall',
                    x: ['Start', 'Sales', 'Costs', 'Tax', 'Profit'],
                    y: [100, 80, -30, -15, null],
                    measure: ['absolute', 'relative', 'relative', 'relative', 'total'],
                    increasing: { marker: { color: '#00ff41' } },
                    decreasing: { marker: { color: '#ef4444' } },
                    totals: { marker: { color: '#3b82f6' } },
                    connector: { line: { color: '#333' } }
                }],
                layout: { title: { text: 'Waterfall Chart Example' } }
            }
        },
        candlestick: {
            name: 'Candlestick',
            desc: 'Finanz-Charts mit Open, High, Low, Close Werten.',
            props: [
                ['type', '"candlestick"'],
                ['x', 'Datum/Zeit Array'],
                ['open / high / low / close', 'Preis-Arrays'],
                ['increasing', '{ line: { color } }'],
                ['decreasing', '{ line: { color } }']
            ],
            example: {
                data: [{
                    type: 'candlestick',
                    x: ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'],
                    open: [100, 105, 102, 110, 108, 115],
                    high: [108, 112, 115, 118, 120, 125],
                    low: [98, 100, 100, 105, 105, 110],
                    close: [105, 102, 110, 108, 115, 122],
                    increasing: { line: { color: '#00ff41' } },
                    decreasing: { line: { color: '#ef4444' } }
                }],
                layout: {
                    title: { text: 'Candlestick Chart Example' },
                    xaxis: { rangeslider: { visible: false } }
                }
            }
        },
        ohlc: {
            name: 'OHLC',
            desc: 'Alternative Finanz-Darstellung mit Balken statt Kerzen.',
            props: [
                ['type', '"ohlc"'],
                ['x', 'Datum/Zeit Array'],
                ['open / high / low / close', 'Preis-Arrays'],
                ['increasing', '{ line: { color } }'],
                ['decreasing', '{ line: { color } }']
            ],
            example: {
                data: [{
                    type: 'ohlc',
                    x: ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'],
                    open: [100, 105, 102, 110, 108, 115],
                    high: [108, 112, 115, 118, 120, 125],
                    low: [98, 100, 100, 105, 105, 110],
                    close: [105, 102, 110, 108, 115, 122],
                    increasing: { line: { color: '#00ff41', width: 2 } },
                    decreasing: { line: { color: '#ef4444', width: 2 } }
                }],
                layout: {
                    title: { text: 'OHLC Chart Example' },
                    xaxis: { rangeslider: { visible: false } }
                }
            }
        },
        polar: {
            name: 'Polar / Radar',
            desc: 'Daten auf kreisförmigen Koordinaten. Ideal für Vergleiche mehrerer Variablen.',
            props: [
                ['type', '"scatterpolar"'],
                ['r', 'Radius-Werte'],
                ['theta', 'Winkel-Werte oder Kategorien'],
                ['fill', '"toself" für gefüllte Flächen'],
                ['mode', '"lines" | "markers" | "lines+markers"']
            ],
            example: {
                data: [{
                    type: 'scatterpolar', mode: 'lines',
                    r: [80, 90, 70, 85, 75, 80],
                    theta: ['Speed', 'Power', 'Defense', 'Agility', 'Stamina', 'Speed'],
                    fill: 'toself',
                    fillcolor: 'rgba(0,255,65,0.2)',
                    line: { color: '#00ff41', width: 2 },
                    name: 'Player A'
                }, {
                    type: 'scatterpolar', mode: 'lines',
                    r: [70, 75, 90, 80, 85, 70],
                    theta: ['Speed', 'Power', 'Defense', 'Agility', 'Stamina', 'Speed'],
                    fill: 'toself',
                    fillcolor: 'rgba(59,130,246,0.2)',
                    line: { color: '#3b82f6', width: 2 },
                    name: 'Player B'
                }],
                layout: {
                    title: { text: 'Radar Chart Example' },
                    polar: { bgcolor: '#0f0f0f', radialaxis: { gridcolor: '#1a1a1a' }, angularaxis: { gridcolor: '#1a1a1a' } }
                }
            }
        },
        indicator: {
            name: 'Indicator / Gauge',
            desc: 'KPI-Anzeigen, Tachos und Delta-Indikatoren.',
            props: [
                ['type', '"indicator"'],
                ['mode', '"number" | "gauge" | "delta" | Kombinationen'],
                ['value', 'Aktueller Wert'],
                ['delta', '{ reference: vorheriger Wert }'],
                ['gauge', '{ axis, bar, steps, threshold }'],
                ['number', '{ suffix, prefix, font }']
            ],
            example: {
                data: [{
                    type: 'indicator', mode: 'gauge+number+delta',
                    value: 78,
                    delta: { reference: 65, increasing: { color: '#00ff41' }, decreasing: { color: '#ef4444' } },
                    gauge: {
                        axis: { range: [0, 100], tickcolor: '#555' },
                        bar: { color: '#00ff41' },
                        bgcolor: '#1a1a1a',
                        bordercolor: '#333',
                        steps: [
                            { range: [0, 50], color: '#1a1a1a' },
                            { range: [50, 75], color: '#0a1a0f' },
                            { range: [75, 100], color: '#0a2a0f' }
                        ],
                        threshold: { line: { color: '#fff', width: 2 }, value: 90 }
                    },
                    number: { font: { color: '#00ff41' } },
                    title: { text: 'Performance Score', font: { color: '#888' } }
                }],
                layout: { title: { text: 'Gauge Example' } }
            }
        }
    };

    const LAYOUT_DOCS = {
        title: 'Layout-Eigenschaften',
        sections: [
            {
                name: 'Titel & Fonts',
                props: [
                    ['title', '{ text, font: { size, color, family }, x, y, xanchor, yanchor }'],
                    ['font', '{ family, size, color } - Global für Chart'],
                    ['hoverlabel', '{ font, bgcolor, bordercolor }']
                ]
            },
            {
                name: 'Achsen (xaxis / yaxis)',
                props: [
                    ['title', '{ text, font, standoff }'],
                    ['type', '"-" | "linear" | "log" | "date" | "category"'],
                    ['range', '[min, max] oder "auto"'],
                    ['showgrid', 'true | false'],
                    ['gridcolor', 'Farbe der Gitterlinien'],
                    ['zeroline', 'true | false'],
                    ['zerolinecolor', 'Farbe der Nulllinie'],
                    ['showticklabels', 'true | false'],
                    ['tickangle', 'Winkel in Grad (-90 bis 90)'],
                    ['tickformat', 'd3-Format String (z.B. ".2f", "%")'],
                    ['tickprefix / ticksuffix', 'Text vor/nach Tick'],
                    ['dtick', 'Tick-Intervall'],
                    ['nticks', 'Anzahl der Ticks'],
                    ['autorange', 'true | false | "reversed"'],
                    ['fixedrange', 'true = kein Zoom auf dieser Achse']
                ]
            },
            {
                name: 'Legende',
                props: [
                    ['showlegend', 'true | false'],
                    ['legend.orientation', '"v" (vertikal) | "h" (horizontal)'],
                    ['legend.x / y', 'Position (0-1 oder negativ)'],
                    ['legend.xanchor / yanchor', '"left" | "center" | "right" / "top" | "middle" | "bottom"'],
                    ['legend.bgcolor', 'Hintergrundfarbe'],
                    ['legend.bordercolor', 'Rahmenfarbe'],
                    ['legend.font', '{ size, color, family }']
                ]
            },
            {
                name: 'Margins & Spacing',
                props: [
                    ['margin', '{ t, r, b, l, pad } - Top, Right, Bottom, Left'],
                    ['autosize', 'true | false'],
                    ['width / height', 'Feste Größe in Pixeln'],
                    ['bargap', 'Abstand zwischen Bars (0-1)'],
                    ['bargroupgap', 'Abstand zwischen Bar-Gruppen']
                ]
            },
            {
                name: 'Interaktivität',
                props: [
                    ['hovermode', '"x" | "y" | "closest" | "x unified" | "y unified" | false'],
                    ['dragmode', '"zoom" | "pan" | "select" | "lasso" | false'],
                    ['clickmode', '"event" | "select" | "event+select"'],
                    ['selectdirection', '"h" | "v" | "d" | "any"']
                ]
            },
            {
                name: 'Bar-Spezifisch',
                props: [
                    ['barmode', '"group" | "stack" | "relative" | "overlay"'],
                    ['barnorm', '"" | "fraction" | "percent"']
                ]
            },
            {
                name: 'Annotationen',
                props: [
                    ['annotations', 'Array von { x, y, text, showarrow, arrowhead, font, ... }'],
                    ['shapes', 'Array von { type, x0, y0, x1, y1, line, fillcolor, ... }']
                ]
            }
        ]
    };

    let modal = null;
    let currentSection = 'overview';

    function injectStyles() {
        if (document.getElementById('plref-css')) return;
        const style = document.createElement('style');
        style.id = 'plref-css';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function syntaxHighlight(json) {
        if (typeof json !== 'string') json = JSON.stringify(json, null, 2);
        return json
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, match => {
                if (/:$/.test(match)) return `<span class="key">${match}</span>`;
                return `<span class="str">${match}</span>`;
            })
            .replace(/\b(true|false|null)\b/g, '<span class="bool">$1</span>')
            .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="num">$1</span>');
    }

    function createChartHTML(id, title) {
        return `
            <div class="plref-chart">
                <div class="plref-chart-title">${title}</div>
                <div class="plref-chart-container" id="${id}"></div>
            </div>
        `;
    }

    function renderChart(containerId, data, layout) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const baseLayout = {
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#888', family: 'JetBrains Mono, monospace', size: 10 },
            margin: { t: 40, r: 20, b: 40, l: 50 },
            xaxis: { gridcolor: '#1a1a1a', zerolinecolor: '#333', linecolor: '#333' },
            yaxis: { gridcolor: '#1a1a1a', zerolinecolor: '#333', linecolor: '#333' },
            ...layout
        };

        if (baseLayout.title) {
            baseLayout.title = { ...baseLayout.title, font: { color: '#00ff41', size: 12 } };
        }

        Plotly.newPlot(container, data, baseLayout, {
            responsive: true,
            displayModeBar: false,
            staticPlot: false
        });
    }

    function renderOverview() {
        return `
            <div class="plref-section">
                <div class="plref-section-title">Plotly JSON Reference</div>
                <div class="plref-desc">
                    Interaktive Dokumentation für <strong>Plotly.js</strong> Charts.
                    Alle Beispiele werden live gerendert und können als Vorlage verwendet werden.
                </div>

                <div class="plref-tip">
                    Charts werden in einem <code>\`\`\`plotly</code> Code-Block mit JSON definiert.
                    Das JSON MUSS ein <code>data</code>-Array enthalten.
                </div>

                <div class="plref-warn">
                    Folgende Layout-Eigenschaften werden automatisch überschrieben:
                    <code>paper_bgcolor</code>, <code>plot_bgcolor</code>, <code>font.color</code>
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Basis-Struktur</div>
                <div class="plref-code">
                    <pre>${syntaxHighlight({
                        data: [
                            {
                                type: "scatter",
                                mode: "lines+markers",
                                x: [1, 2, 3, 4, 5],
                                y: [10, 15, 13, 17, 20],
                                name: "Serie 1"
                            }
                        ],
                        layout: {
                            title: { text: "Chart Titel" },
                            xaxis: { title: { text: "X-Achse" } },
                            yaxis: { title: { text: "Y-Achse" } }
                        }
                    })}</pre>
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Farbpalette</div>
                <div class="plref-color-grid">
                    ${COLORS.map(c => `
                        <div class="plref-color">
                            <div class="plref-color-swatch" style="background:${c.hex}"></div>
                            <span class="plref-color-hex">${c.hex}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Quick Examples</div>
                <div class="plref-grid">
                    ${createChartHTML('overview-scatter', 'SCATTER')}
                    ${createChartHTML('overview-bar', 'BAR')}
                    ${createChartHTML('overview-pie', 'PIE')}
                    ${createChartHTML('overview-heatmap', 'HEATMAP')}
                </div>
            </div>
        `;
    }

    function renderChartType(key) {
        const chart = CHART_TYPES[key];
        if (!chart) return '<div>Chart type not found</div>';

        return `
            <div class="plref-section">
                <div class="plref-section-title">${chart.name}</div>
                <div class="plref-desc">${chart.desc}</div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Eigenschaften</div>
                <div class="plref-props">
                    ${chart.props.map(([name, val]) => `
                        <div class="plref-prop">
                            <div class="plref-prop-name">${name}</div>
                            <div class="plref-prop-val"><code>${val}</code></div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Live Beispiel</div>
                ${createChartHTML(`chart-${key}`, chart.name.toUpperCase())}
            </div>

            <div class="plref-section">
                <div class="plref-section-title">JSON Code</div>
                <div class="plref-code">
                    <pre>${syntaxHighlight(chart.example)}</pre>
                </div>
            </div>
        `;
    }

    function renderLayoutDocs() {
        return `
            <div class="plref-section">
                <div class="plref-section-title">${LAYOUT_DOCS.title}</div>
                <div class="plref-desc">
                    Das <code>layout</code>-Objekt steuert das Aussehen des gesamten Charts:
                    Titel, Achsen, Legende, Margins und Interaktivität.
                </div>
            </div>

            ${LAYOUT_DOCS.sections.map(section => `
                <div class="plref-section">
                    <div class="plref-section-title">${section.name}</div>
                    <div class="plref-props">
                        ${section.props.map(([name, val]) => `
                            <div class="plref-prop">
                                <div class="plref-prop-name">${name}</div>
                                <div class="plref-prop-val"><code>${val}</code></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}

            <div class="plref-section">
                <div class="plref-section-title">Beispiel Layout</div>
                <div class="plref-code">
                    <pre>${syntaxHighlight({
                        title: { text: "Chart Titel", font: { size: 16 } },
                        xaxis: {
                            title: { text: "X-Achse" },
                            showgrid: true,
                            gridcolor: "#1a1a1a",
                            tickangle: -45
                        },
                        yaxis: {
                            title: { text: "Y-Achse" },
                            zeroline: true,
                            zerolinecolor: "#333"
                        },
                        legend: {
                            orientation: "h",
                            x: 0.5,
                            xanchor: "center",
                            y: -0.15
                        },
                        margin: { t: 60, r: 40, b: 80, l: 60 },
                        hovermode: "x unified",
                        barmode: "group"
                    })}</pre>
                </div>
            </div>
        `;
    }

    function renderColorscales() {
        return `
            <div class="plref-section">
                <div class="plref-section-title">Colorscales</div>
                <div class="plref-desc">
                    Colorscales werden für <code>heatmap</code>, <code>contour</code>, <code>surface</code>
                    und <code>marker.color</code> mit numerischen Werten verwendet.
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Sequentielle Scales</div>
                <div class="plref-props">
                    <div class="plref-prop"><div class="plref-prop-name">Viridis</div><div class="plref-prop-val">Blau → Grün → Gelb (Standard)</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Plasma</div><div class="plref-prop-val">Blau → Violett → Gelb</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Inferno</div><div class="plref-prop-val">Schwarz → Rot → Gelb</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Magma</div><div class="plref-prop-val">Schwarz → Violett → Gelb</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Cividis</div><div class="plref-prop-val">Blau → Gelb (Farbenblind-freundlich)</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Blues</div><div class="plref-prop-val">Weiß → Blau</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Greens</div><div class="plref-prop-val">Weiß → Grün</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Reds</div><div class="plref-prop-val">Weiß → Rot</div></div>
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Divergierende Scales</div>
                <div class="plref-props">
                    <div class="plref-prop"><div class="plref-prop-name">RdBu</div><div class="plref-prop-val">Rot → Weiß → Blau</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">RdYlGn</div><div class="plref-prop-val">Rot → Gelb → Grün</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Spectral</div><div class="plref-prop-val">Rot → Orange → Gelb → Grün → Blau</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">Picnic</div><div class="plref-prop-val">Blau → Weiß → Rot</div></div>
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Custom Colorscale</div>
                <div class="plref-code">
                    <pre>${syntaxHighlight({
                        colorscale: [
                            [0, "#0a0a0a"],
                            [0.25, "#1a0a2a"],
                            [0.5, "#00ff41"],
                            [0.75, "#00ffaa"],
                            [1, "#ffffff"]
                        ]
                    })}</pre>
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Colorscale Beispiele</div>
                <div class="plref-grid">
                    ${createChartHTML('colorscale-viridis', 'VIRIDIS')}
                    ${createChartHTML('colorscale-rdbu', 'RdBu (DIVERGIEREND)')}
                </div>
            </div>
        `;
    }

    function renderHovertemplate() {
        return `
            <div class="plref-section">
                <div class="plref-section-title">Hovertemplate</div>
                <div class="plref-desc">
                    Mit <code>hovertemplate</code> können Tooltips individuell formatiert werden.
                    Variablen werden mit <code>%{variable}</code> eingefügt.
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Verfügbare Variablen</div>
                <div class="plref-props">
                    <div class="plref-prop"><div class="plref-prop-name">%{x}</div><div class="plref-prop-val">X-Wert</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{y}</div><div class="plref-prop-val">Y-Wert</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{z}</div><div class="plref-prop-val">Z-Wert (3D, Heatmap)</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{text}</div><div class="plref-prop-val">Text-Array Wert</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{customdata}</div><div class="plref-prop-val">Zusätzliche Daten</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{label}</div><div class="plref-prop-val">Pie/Sunburst Label</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{value}</div><div class="plref-prop-val">Pie/Sunburst Wert</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{percent}</div><div class="plref-prop-val">Pie/Sunburst Prozent</div></div>
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Formatierung</div>
                <div class="plref-props">
                    <div class="plref-prop"><div class="plref-prop-name">%{y:.2f}</div><div class="plref-prop-val">2 Dezimalstellen</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{y:,.0f}</div><div class="plref-prop-val">Tausendertrennzeichen</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{y:.1%}</div><div class="plref-prop-val">Prozent (0.5 → 50.0%)</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">%{x|%Y-%m-%d}</div><div class="plref-prop-val">Datumsformat</div></div>
                    <div class="plref-prop"><div class="plref-prop-name">&lt;extra&gt;&lt;/extra&gt;</div><div class="plref-prop-val">Entfernt Trace-Name aus Tooltip</div></div>
                </div>
            </div>

            <div class="plref-section">
                <div class="plref-section-title">Beispiele</div>
                <div class="plref-code">
                    <pre>${syntaxHighlight({
                        hovertemplate: "<b>%{x}</b><br>Wert: %{y:.2f}<br>Kategorie: %{text}<extra></extra>"
                    })}</pre>
                </div>
                ${createChartHTML('hover-example', 'HOVER OVER POINTS')}
            </div>
        `;
    }

    function updateContent() {
        const content = document.getElementById('plref-content');
        if (!content) return;

        let html = '';

        if (currentSection === 'overview') {
            html = renderOverview();
        } else if (currentSection === 'layout') {
            html = renderLayoutDocs();
        } else if (currentSection === 'colorscales') {
            html = renderColorscales();
        } else if (currentSection === 'hovertemplate') {
            html = renderHovertemplate();
        } else if (CHART_TYPES[currentSection]) {
            html = renderChartType(currentSection);
        }

        content.innerHTML = html;

        // Update active nav item
        document.querySelectorAll('.plref-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === currentSection);
        });

        // Render charts after DOM update
        setTimeout(() => renderCharts(), 100);
    }

    function renderCharts() {
        // Overview charts
        if (document.getElementById('overview-scatter')) {
            renderChart('overview-scatter',
                [{ type: 'scatter', mode: 'lines+markers', x: [1,2,3,4,5], y: [2,5,3,7,5], marker: { color: '#00ff41', size: 6 }, line: { width: 2 } }],
                {}
            );
        }
        if (document.getElementById('overview-bar')) {
            renderChart('overview-bar',
                [{ type: 'bar', x: ['A','B','C','D'], y: [20,35,25,40], marker: { color: '#3b82f6' } }],
                {}
            );
        }
        if (document.getElementById('overview-pie')) {
            renderChart('overview-pie',
                [{ type: 'pie', labels: ['X','Y','Z'], values: [40,30,30], hole: 0.4, marker: { colors: ['#00ff41','#3b82f6','#f59e0b'], line: { color: '#0a0a0a', width: 2 } }, textfont: { color: '#fff' } }],
                {}
            );
        }
        if (document.getElementById('overview-heatmap')) {
            renderChart('overview-heatmap',
                [{ type: 'heatmap', z: [[1,2,3],[4,5,6],[7,8,9]], colorscale: [[0,'#0a0a0a'],[0.5,'#00ff41'],[1,'#fff']], showscale: false }],
                {}
            );
        }

        // Colorscale examples
        if (document.getElementById('colorscale-viridis')) {
            renderChart('colorscale-viridis',
                [{ type: 'heatmap', z: Array.from({length:10}, (_,i) => Array.from({length:10}, (_,j) => i+j)), colorscale: 'Viridis', showscale: true }],
                {}
            );
        }
        if (document.getElementById('colorscale-rdbu')) {
            renderChart('colorscale-rdbu',
                [{ type: 'heatmap', z: Array.from({length:10}, (_,i) => Array.from({length:10}, (_,j) => (i-5)+(j-5))), colorscale: 'RdBu', showscale: true }],
                {}
            );
        }

        // Hovertemplate example
        if (document.getElementById('hover-example')) {
            renderChart('hover-example',
                [{
                    type: 'scatter', mode: 'markers',
                    x: [1,2,3,4,5],
                    y: [10,25,18,32,28],
                    text: ['Low', 'Medium', 'Medium', 'High', 'High'],
                    marker: { color: '#00ff41', size: 12 },
                    hovertemplate: '<b>X: %{x}</b><br>Wert: %{y}<br>Level: %{text}<extra></extra>'
                }],
                {}
            );
        }

        // Chart type specific examples
        Object.keys(CHART_TYPES).forEach(key => {
            const containerId = `chart-${key}`;
            if (document.getElementById(containerId)) {
                const chart = CHART_TYPES[key];
                renderChart(containerId, chart.example.data, chart.example.layout);
            }
        });
    }

    function createModal() {
        modal = document.createElement('div');
        modal.className = 'plref-modal';
        modal.innerHTML = `
            <div class="plref-header">
                <div class="plref-title">[<span>PLOTLY</span>] Reference Terminal v1.0</div>
                <button class="plref-close">×</button>
            </div>
            <div class="plref-container">
                <div class="plref-sidebar">
                    <div class="plref-nav-section">
                        <div class="plref-nav-title">Getting Started</div>
                        <div class="plref-nav-item active" data-section="overview">Overview</div>
                        <div class="plref-nav-item" data-section="layout">Layout Options</div>
                        <div class="plref-nav-item" data-section="colorscales">Colorscales</div>
                        <div class="plref-nav-item" data-section="hovertemplate">Hovertemplate</div>
                    </div>
                    <div class="plref-nav-section">
                        <div class="plref-nav-title">Basic Charts</div>
                        <div class="plref-nav-item" data-section="scatter"><code>scatter</code> Line/Scatter</div>
                        <div class="plref-nav-item" data-section="bar"><code>bar</code> Bar Chart</div>
                        <div class="plref-nav-item" data-section="barh"><code>bar</code> Horizontal</div>
                        <div class="plref-nav-item" data-section="pie"><code>pie</code> Pie/Donut</div>
                        <div class="plref-nav-item" data-section="area"><code>scatter</code> Area</div>
                    </div>
                    <div class="plref-nav-section">
                        <div class="plref-nav-title">Statistical</div>
                        <div class="plref-nav-item" data-section="histogram"><code>histogram</code></div>
                        <div class="plref-nav-item" data-section="box"><code>box</code> Box Plot</div>
                        <div class="plref-nav-item" data-section="violin"><code>violin</code></div>
                        <div class="plref-nav-item" data-section="heatmap"><code>heatmap</code></div>
                        <div class="plref-nav-item" data-section="contour"><code>contour</code></div>
                    </div>
                    <div class="plref-nav-section">
                        <div class="plref-nav-title">3D Charts</div>
                        <div class="plref-nav-item" data-section="scatter3d"><code>scatter3d</code></div>
                        <div class="plref-nav-item" data-section="surface"><code>surface</code></div>
                    </div>
                    <div class="plref-nav-section">
                        <div class="plref-nav-title">Specialized</div>
                        <div class="plref-nav-item" data-section="sankey"><code>sankey</code></div>
                        <div class="plref-nav-item" data-section="treemap"><code>treemap</code></div>
                        <div class="plref-nav-item" data-section="sunburst"><code>sunburst</code></div>
                        <div class="plref-nav-item" data-section="funnel"><code>funnel</code></div>
                        <div class="plref-nav-item" data-section="waterfall"><code>waterfall</code></div>
                        <div class="plref-nav-item" data-section="polar"><code>scatterpolar</code></div>
                        <div class="plref-nav-item" data-section="indicator"><code>indicator</code></div>
                    </div>
                    <div class="plref-nav-section">
                        <div class="plref-nav-title">Financial</div>
                        <div class="plref-nav-item" data-section="candlestick"><code>candlestick</code></div>
                        <div class="plref-nav-item" data-section="ohlc"><code>ohlc</code></div>
                    </div>
                </div>
                <div class="plref-content" id="plref-content"></div>
            </div>
        `;

        modal.querySelector('.plref-close').onclick = () => toggleModal();

        modal.querySelectorAll('.plref-nav-item').forEach(item => {
            item.onclick = () => {
                currentSection = item.dataset.section;
                updateContent();
            };
        });

        document.body.appendChild(modal);
    }

    function toggleModal() {
        if (!modal) createModal();
        const isActive = modal.classList.toggle('active');
        if (isActive) {
            updateContent();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }

    function createToggle() {
        const toggle = document.createElement('button');
        toggle.className = 'plref-toggle';
        toggle.innerHTML = '📊';
        toggle.title = 'Plotly Reference';
        toggle.onclick = toggleModal;
        document.body.appendChild(toggle);
    }

    function init() {
        injectStyles();
        createToggle();

        // Keyboard shortcut
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                toggleModal();
            }
            if (e.key === 'Escape' && modal?.classList.contains('active')) {
                toggleModal();
            }
        });

        console.log('[Plotly Reference Terminal] Initialized. Press Ctrl+Shift+P or click 📊 button.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();