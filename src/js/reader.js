// Reader state
let currentContent = null;
let pageNum = 1;
let scale = 1.0;

// Get elements
const container = document.getElementById('viewerContainer');
const viewer = document.getElementById('pdfViewer');
const themeToggle = document.getElementById('checkbox');

// Theme toggle functionality
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
}

// Initialize theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.checked = true;
    }
}

// Add theme toggle event listener
themeToggle.addEventListener('change', toggleTheme);

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const bookId = urlParams.get('id');
console.log('Book ID from URL:', bookId);

// Clean up reader state when navigating away
function clearReaderState() {
    // Clear any active content
    if (currentContent) {
        currentContent.destroy?.();
        currentContent = null;
    }
    
    // Clear viewer content
    if (viewer) {
        viewer.innerHTML = '';
    }
    
    // Remove any observers
    if (window._themeObserver) {
        window._themeObserver.disconnect();
        window._themeObserver = null;
    }
    
    // Clear any cached data
    localStorage.removeItem(`reader_state_${bookId}`);
}

// Handle page unload
window.addEventListener('beforeunload', clearReaderState);

// Initialize reader
async function initReader() {
    try {
        // Check if book ID is provided
        if (!bookId) {
            throw new Error('No book ID provided');
        }

        console.log('Fetching book details for ID:', bookId);
        
        // Fetch book details and file URL
        const response = await fetch(`../get_book_file.php?id=${bookId}`);
        console.log('Response status:', response.status);
        
        const text = await response.text();
        console.log('Raw response:', text);
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('JSON parse error:', e);
            throw new Error('Invalid JSON response: ' + text);
        }
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch book details');
        }
        
        console.log('Book details received:', data);

        // Update book title
        document.getElementById('bookTitle').textContent = data.title;
        document.title = `BookHub - Reading ${data.title}`;

        // Load content based on file type
        if (data.file_type === 'pdf') {
            console.log('Loading PDF file:', data.file_url);
            await loadPDF(data.file_url);
        } else if (data.file_type === 'html') {
            console.log('Loading HTML file:', data.file_url);
            await loadHTML(data.file_url);
        } else {
            throw new Error(`Unsupported file type: ${data.file_type}`);
        }
        
    } catch (error) {
        console.error('Error initializing reader:', error);
        alert(`Error loading the book: ${error.message}`);
    }
}

// Load HTML content
async function loadHTML(url) {
    try {
        console.log('Fetching HTML content from:', url);
        
        // Fetch HTML content
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch HTML content: ${response.statusText}`);
        }
        
        const html = await response.text();
        console.log('HTML content received, length:', html.length);
        
        // Create iframe for content
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        
        // Clear viewer and add iframe
        viewer.innerHTML = '';
        viewer.appendChild(iframe);
        
        // Write content to iframe with styles
        iframe.contentDocument.open();
        iframe.contentDocument.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    :root {
                        color-scheme: light dark;
                    }
                    body {
                        font-family: Georgia, serif;
                        line-height: 1.6;
                        padding: 40px;
                        margin: 0;
                        background-color: var(--bg-color, ${document.body.classList.contains('dark-mode') ? '#1a1a1a' : '#ffffff'});
                        color: var(--text-color, ${document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000'});
                        transition: background-color 0.3s, color 0.3s;
                    }
                    h1, h2 {
                        color: var(--heading-color, ${document.body.classList.contains('dark-mode') ? '#e1e1e1' : '#2c3e50'});
                        transition: color 0.3s;
                    }
                    p {
                        margin-bottom: 1.2em;
                        font-size: 1.1em;
                    }
                    @media (max-width: 768px) {
                        body {
                            padding: 20px;
                        }
                        p {
                            font-size: 1em;
                        }
                    }
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `);
        iframe.contentDocument.close();
        
        // Hide PDF controls
        const controls = document.querySelector('.reader-controls');
        if (controls) {
            controls.style.display = 'none';
        }
        
        // Update iframe theme when theme changes
        window._themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isDarkMode = document.body.classList.contains('dark-mode');
                    const doc = iframe.contentDocument;
                    if (doc && doc.body) {
                        doc.body.style.backgroundColor = isDarkMode ? '#1a1a1a' : '#ffffff';
                        doc.body.style.color = isDarkMode ? '#ffffff' : '#000000';
                        const headings = doc.querySelectorAll('h1, h2');
                        headings.forEach(h => h.style.color = isDarkMode ? '#e1e1e1' : '#2c3e50');
                    }
                }
            });
        });
        window._themeObserver.observe(document.body, { attributes: true });
        
    } catch (error) {
        console.error('Error loading HTML:', error);
        throw error;
    }
}

// Load PDF content
async function loadPDF(url) {
    try {
        // Initialize PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        
        // Load PDF document
        const loadingTask = pdfjsLib.getDocument(url);
        currentContent = await loadingTask.promise;
        
        // Get the first page
        const page = await currentContent.getPage(1);
        
        // Prepare canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Calculate scale to fit width
        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = container.clientWidth - 40; // Account for padding
        scale = containerWidth / viewport.width;
        
        // Set canvas dimensions
        const scaledViewport = page.getViewport({ scale });
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        // Clear viewer and add canvas
        viewer.innerHTML = '';
        viewer.appendChild(canvas);
        
        // Render PDF page
        await page.render({
            canvasContext: context,
            viewport: scaledViewport
        });
        
    } catch (error) {
        console.error('Error loading PDF:', error);
        throw error;
    }
}

// Initialize reader when page loads
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initReader();
});
