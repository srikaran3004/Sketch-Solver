// UI components from Mantine and internal custom Button
import { ColorSwatch, Group } from '@mantine/core'; //UI components from Mantine for color selection
import { Button } from '@/components/ui/button';

// React hooks and libraries
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable'; // For dragging LaTeX expressions around

// Predefined color swatches
import { SWATCHES } from '@/constants';

// Interfaces to type-check the response from backend
interface GeneratedResult {
    expression: string;
    answer: string;
}

interface Response {
    expr: string;
    result: string;
    assign: boolean;
}

export default function Home() {
    // Reference to the canvas DOM node
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // States for drawing and logic
    const [isDrawing, setIsDrawing] = useState(false);  // Is user currently drawing?
    const [color, setColor] = useState('rgb(255, 255, 255)');  // Selected drawing color
    const [reset, setReset] = useState(false);  // Trigger for resetting canvas
    const [dictOfVars, setDictOfVars] = useState({});  // Holds variable assignments from server
    const [result, setResult] = useState<GeneratedResult>();  // Single processed result
    const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });  // Position of draggable LaTeX output
    const [latexExpression, setLatexExpression] = useState<Array<string>>([]);  // Stores multiple LaTeX expressions

    // Load MathJax rendering after new LaTeX expression is added
    useEffect(() => {
        if (latexExpression.length > 0 && window.MathJax) {
            setTimeout(() => {  
                window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
            }, 0);
        }
    }, [latexExpression]);

    // If new result arrives from server, trigger LaTeX rendering
    useEffect(() => {
        if (result) {
            renderLatexToCanvas(result.expression, result.answer);
        }
    }, [result]);

    // Reset canvas and states when triggered
    useEffect(() => {
        if (reset) {
            resetCanvas();
            setLatexExpression([]);
            setResult(undefined);
            setDictOfVars({});
            setReset(false);
        }
    }, [reset]);

    // Initialize canvas and load MathJax script on mount
    useEffect(() => {
        const canvas = canvasRef.current;
    
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight - canvas.offsetTop;
                ctx.lineCap = 'round';
                ctx.lineWidth = 3;
            }
        }

        // Inject MathJax script into document head
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML';
        script.async = true;
        document.head.appendChild(script);

        // Configure MathJax after it loads
        script.onload = () => {
            window.MathJax.Hub.Config({
                tex2jax: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
            });
        };

        // Cleanup script on component unmount
        return () => {
            document.head.removeChild(script);
        };
    }, []);

    // Render a new LaTeX equation to be displayed on canvas
    const renderLatexToCanvas = (expression: string, answer: string) => {
        const latex = `\\(\\LARGE{${expression} = ${answer}}\\)`;
        setLatexExpression([...latexExpression, latex]);

        // Clear drawing on the canvas when rendering result
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    // Clear the canvas drawing
    const resetCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    // Mouse down handler to begin drawing
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.background = 'black';  // Set canvas background
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                setIsDrawing(true);
            }
        }
    };

    // Mouse move handler for drawing
    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.strokeStyle = color;
                ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                ctx.stroke();
            }
        }
    };

    // Stop drawing on mouse up or mouse out
    const stopDrawing = () => {
        setIsDrawing(false);
    };  

    // Send canvas image and variable dict to backend for processing
    const runRoute = async () => {
        const canvas = canvasRef.current;

        if (canvas) {
            // Send image and variables to the backend
            const response = await axios({
                method: 'post',
                url: `${import.meta.env.VITE_API_URL}/calculate`,
                data: {
                    image: canvas.toDataURL('image/png'),
                    dict_of_vars: dictOfVars
                }
            });

            const resp = await response.data;
            console.log('Response', resp);

            // Store variables if response has assignments
            resp.data.forEach((data: Response) => {
                if (data.assign === true) {
                    setDictOfVars({
                        ...dictOfVars,
                        [data.expr]: data.result
                    });
                }
            });

            // Calculate bounding box of drawn content
            const ctx = canvas.getContext('2d');
            const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = (y * canvas.width + x) * 4;
                    if (imageData.data[i + 3] > 0) {  // Check for non-transparent pixel
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }
            }

            // Position LaTeX output near the center of drawn area
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            setLatexPosition({ x: centerX, y: centerY });

            // Update result state with delay for better UX
            resp.data.forEach((data: Response) => {
                setTimeout(() => {
                    setResult({
                        expression: data.expr,
                        answer: data.result
                    });
                }, 1000);
            });
        }
    };

    return (
        <>
            {/* Top control panel */}
            <div className='grid grid-cols-3 gap-2'>
                {/* Reset button */}
                <Button
                    onClick={() => setReset(true)}
                    className='z-20 bg-black text-white'
                    variant='default' 
                    color='black'
                >
                    Reset
                </Button>

                {/* Color swatches for drawing */}
                <Group className='z-20'>
                    {SWATCHES.map((swatch) => (
                        <ColorSwatch key={swatch} color={swatch} onClick={() => setColor(swatch)} />
                    ))}
                </Group>

                {/* Run button to send image to backend */}
                <Button
                    onClick={runRoute}
                    className='z-20 bg-black text-white'
                    variant='default'
                    color='white'
                >
                    Run
                </Button>
            </div>

            {/* Drawing canvas */}
            <canvas
                ref={canvasRef}
                id='canvas'
                className='absolute top-0 left-0 w-full h-full'
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
            />

            {/* Render draggable LaTeX results on screen */}
            {latexExpression && latexExpression.map((latex, index) => (
                <Draggable
                    key={index}
                    defaultPosition={latexPosition}
                    onStop={(_, data) => setLatexPosition({ x: data.x, y: data.y })}
                >
                    <div className="absolute p-2 text-white rounded shadow-md">
                        <div className="latex-content">{latex}</div>
                    </div>
                </Draggable>
            ))}
        </>
    );
}
