gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById('circuit-canvas');
const ctx = canvas.getContext('2d');

let dpr = window.devicePixelRatio || 1;
let baseParticleCount = 200;
let particleCount;
let baseScreenArea = 1440 * 900;
let hue = 180;

function getParticleCount(screenArea) {
    if (screenArea < 360000) {
        return 50;
    } else if (screenArea < 640000) {
        return 100;
    } else if (screenArea < 1000000) {
        return 150;
    } else if (screenArea < 1440000) {
        return 200;
    } else {
        return 250;
    }
}

function calculateParticleCount() {
    let screenArea = window.innerWidth * window.innerHeight;
    let newParticleCount = getParticleCount(screenArea);
    
    if (newParticleCount !== particleCount) {
        particleCount = newParticleCount;
        initParticles();
        initBoids();
        initElasticPoints();
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);
    calculateParticleCount();
}

// Particle System
class Particle {
    constructor() {
        this.x = Math.random() * (canvas.width / dpr);
        this.y = Math.random() * (canvas.height / dpr);
        this.size = (Math.random() * 2 + 1) * dpr;
        this.speedX = (Math.random() - 0.5) * dpr;
        this.speedY = (Math.random() - 0.5) * dpr;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x < 0 || this.x > canvas.width / dpr) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height / dpr) this.speedY *= -1;

        if (this.size > 0.2 * dpr) this.size -= 0.01 * dpr;
    }
    draw() {
        ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.8)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / dpr, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Boid System
class Boid {
    constructor() {
        this.position = new Vector(Math.random() * canvas.width / dpr, Math.random() * canvas.height / dpr);
        this.velocity = new Vector(Math.random() * 2 - 1, Math.random() * 2 - 1);
        this.acceleration = new Vector(0, 0);
        this.maxForce = 0.05;
        this.maxSpeed = 1.5;
        this.size = 3;
        this.stretchFactor = 1;
    }

    update() {
        this.velocity.add(this.acceleration);
        this.velocity.limit(this.maxSpeed);
        this.position.add(this.velocity);
        this.acceleration.mult(0);

        let speed = this.velocity.mag();
        this.stretchFactor = 1 + speed * 0.5;

        if (this.position.x < 0) this.position.x = canvas.width / dpr;
        if (this.position.y < 0) this.position.y = canvas.height / dpr;
        if (this.position.x > canvas.width / dpr) this.position.x = 0;
        if (this.position.y > canvas.height / dpr) this.position.y = 0;
    }

    draw() {
        ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.8)`;
        ctx.beginPath();
        
        let angle = Math.atan2(this.velocity.y, this.velocity.x);
        ctx.ellipse(
            this.position.x,
            this.position.y,
            this.size * this.stretchFactor,
            this.size / this.stretchFactor,
            angle,
            0,
            Math.PI * 2
        );
        
        ctx.fill();
    }

    flock(boids) {
        let alignment = this.align(boids);
        let cohesion = this.cohesion(boids);
        let separation = this.separation(boids);

        alignment.mult(1.0);
        cohesion.mult(1.0);
        separation.mult(1.5);

        this.acceleration.add(alignment);
        this.acceleration.add(cohesion);
        this.acceleration.add(separation);
    }

    align(boids) {
        let perceptionRadius = 25;
        let steering = new Vector(0, 0);
        let total = 0;
        for (let other of boids) {
            let d = this.position.dist(other.position);
            if (other != this && d < perceptionRadius) {
                steering.add(other.velocity);
                total++;
            }
        }
        if (total > 0) {
            steering.div(total);
            steering.setMag(this.maxSpeed);
            steering.sub(this.velocity);
            steering.limit(this.maxForce);
        }
        return steering;
    }

    cohesion(boids) {
        let perceptionRadius = 50;
        let steering = new Vector(0, 0);
        let total = 0;
        for (let other of boids) {
            let d = this.position.dist(other.position);
            if (other != this && d < perceptionRadius) {
                steering.add(other.position);
                total++;
            }
        }
        if (total > 0) {
            steering.div(total);
            steering.sub(this.position);
            steering.setMag(this.maxSpeed);
            steering.sub(this.velocity);
            steering.limit(this.maxForce);
        }
        return steering;
    }

    separation(boids) {
        let perceptionRadius = 30;
        let steering = new Vector(0, 0);
        let total = 0;
        for (let other of boids) {
            let d = this.position.dist(other.position);
            if (other != this && d < perceptionRadius) {
                let diff = Vector.sub(this.position, other.position);
                diff.div(d * d);
                steering.add(diff);
                total++;
            }
        }
        if (total > 0) {
            steering.div(total);
            steering.setMag(this.maxSpeed);
            steering.sub(this.velocity);
            steering.limit(this.maxForce);
        }
        return steering;
    }
}

// Elastic System
class ElasticPoint {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 16;
        this.vy = (Math.random() - 0.5) * 16;
        this.baseRadius = 5;
        this.radius = this.baseRadius;
        this.gravity = 0.0;
        this.trail = [];
        this.trailLength = 0;
        this.squishFactor = 1;
        this.squishDecay = 0.1;
    }

    update() {
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > this.trailLength) {
            this.trail.shift();
        }

        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;

        let speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        this.squishFactor = 1 + speed * 0.1;

        this.squishFactor = 1 + (this.squishFactor - 1) * (1 - this.squishDecay);

        if (this.x - this.baseRadius < 0 || this.x + this.baseRadius > canvas.width / dpr) {
            this.vx = -this.vx;
            this.x = Math.max(this.baseRadius, Math.min(canvas.width / dpr - this.baseRadius, this.x));
            this.squishFactor = 1.5;
        }
        if (this.y - this.baseRadius < 0 || this.y + this.baseRadius > canvas.height / dpr) {
            this.vy = -this.vy;
            this.y = Math.max(this.baseRadius, Math.min(canvas.height / dpr - this.baseRadius, this.y));
            this.squishFactor = 1.5;
        }
    }

    draw() {
        ctx.beginPath();
        for (let i = 0; i < this.trail.length; i++) {
            const alpha = i / this.trail.length;
            ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${alpha})`;
            if (i === 0) {
                ctx.moveTo(this.trail[i].x, this.trail[i].y);
            } else {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
        }
        ctx.stroke();

        ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.8)`;
        ctx.beginPath();
        ctx.ellipse(
            this.x, 
            this.y, 
            this.baseRadius * this.squishFactor, 
            this.baseRadius / this.squishFactor, 
            Math.atan2(this.vy, this.vx), 
            0, 
            Math.PI * 2
        );
        ctx.fill();
    }
}

// Vector class for Boid calculations
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
    }

    mult(n) {
        this.x *= n;
        this.y *= n;
    }

    div(n) {
        this.x /= n;
        this.y /= n;
    }

    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    setMag(n) {
        this.normalize();
        this.mult(n);
    }

    normalize() {
        let m = this.mag();
        if (m !== 0) {
            this.div(m);
        }
    }

    limit(max) {
        if (this.mag() > max) {
            this.normalize();
            this.mult(max);
        }
    }

    static sub(v1, v2) {
        return new Vector(v1.x - v2.x, v1.y - v2.y);
    }

    dist(v) {
        let dx = this.x - v.x;
        let dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

let particles, boids, elasticPoints;
let currentSystem = 'particles';

function initParticles() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

function initBoids() {
    boids = [];
    let boidCount = Math.floor(particleCount / 3);
    for (let i = 0; i < boidCount; i++) {
        boids.push(new Boid());
    }
}

function initElasticPoints() {
    elasticPoints = [];
    let elasticPointCount = Math.floor(particleCount / 6);
    for (let i = 0; i < elasticPointCount; i++) {
        elasticPoints.push(new ElasticPoint(
            Math.random() * canvas.width / dpr,
            Math.random() * canvas.height / dpr
        ));
    }
}

let lastTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS;

function animate(currentTime) {
    requestAnimationFrame(animate);

    // Calculate time elapsed since last frame
    const deltaTime = currentTime - lastTime;

    // Only update if enough time has passed
    if (deltaTime > frameInterval) {
        // Adjust last time, accounting for any extra time beyond the frame interval
        lastTime = currentTime - (deltaTime % frameInterval);

        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

        if (currentSystem === 'particles') {
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
                
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 100) {
                        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${1 - distance / 100})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }

                if (particles[i].size <= 0.2 * dpr) {
                    particles[i] = new Particle();
                }
            }
        } else if (currentSystem === 'boids') {
            for (let boid of boids) {
                boid.flock(boids);
                boid.update();
                boid.draw();
            }
            
            for (let i = 0; i < boids.length; i++) {
                for (let j = i + 1; j < boids.length; j++) {
                    let d = boids[i].position.dist(boids[j].position);
                    if (d < 30) {
                        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${1 - d / 30})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(boids[i].position.x, boids[i].position.y);
                        ctx.lineTo(boids[j].position.x, boids[j].position.y);
                        ctx.stroke();
                    }
                }
            }
        } else if (currentSystem === 'elastic') {
            for (let i = 0; i < elasticPoints.length; i++) {
                elasticPoints[i].update();
                elasticPoints[i].draw();
                
                for (let j = i + 1; j < elasticPoints.length; j++) {
                    let dx = elasticPoints[j].x - elasticPoints[i].x;
                    let dy = elasticPoints[j].y - elasticPoints[i].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < elasticPoints[i].baseRadius + elasticPoints[j].baseRadius) {
                        let angle = Math.atan2(dy, dx);
                        let sin = Math.sin(angle);
                        let cos = Math.cos(angle);

                        let vx1 = elasticPoints[i].vx * cos + elasticPoints[i].vy * sin;
                        let vy1 = elasticPoints[i].vy * cos - elasticPoints[i].vx * sin;
                        let vx2 = elasticPoints[j].vx * cos + elasticPoints[j].vy * sin;
                        let vy2 = elasticPoints[j].vy * cos - elasticPoints[j].vx * sin;

                        let temp = vx1;
                        vx1 = vx2;
                        vx2 = temp;

                        elasticPoints[i].vx = vx1 * cos - vy1 * sin;
                        elasticPoints[i].vy = vy1 * cos + vx1 * sin;
                        elasticPoints[j].vx = vx2 * cos - vy2 * sin;
                        elasticPoints[j].vy = vy2 * cos + vx2 * sin;

                        let overlap = elasticPoints[i].baseRadius + elasticPoints[j].baseRadius - distance;
                        elasticPoints[i].x -= overlap/2 * cos;
                        elasticPoints[i].y -= overlap/2 * sin;
                        elasticPoints[j].x += overlap/2 * cos;
                        elasticPoints[j].y += overlap/2 * sin;

                        elasticPoints[i].squishFactor = 1.5;
                        elasticPoints[j].squishFactor = 1.5;
                    }
                }
            }
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedResizeCanvas = debounce(resizeCanvas, 250);

window.addEventListener('resize', debouncedResizeCanvas);

resizeCanvas();
calculateParticleCount();
initParticles();
initBoids();
initElasticPoints();
animate(0);

gsap.to({}, {
    scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
            hue = 180 + (self.progress * 180);
        }
    }
});

gsap.to({}, {
    scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
            const progress = self.progress;
            const algorithmInfo = document.getElementById('current-algorithm');
            const algorithmLink = document.getElementById('algorithm-info').querySelector('a');
            
            if (progress < 0.33) {
                currentSystem = 'particles';
                algorithmInfo.textContent = 'Network Connection';
                algorithmLink.href = 'https://en.wikipedia.org/wiki/Network_theory';
            } else if (progress < 0.66) {
                currentSystem = 'boids';
                algorithmInfo.textContent = 'Boids';
                algorithmLink.href = 'https://en.wikipedia.org/wiki/Boids';
            } else {
                currentSystem = 'elastic';
                algorithmInfo.textContent = 'Physics Engine';
                algorithmLink.href = 'https://en.wikipedia.org/wiki/Physics_engine';
            }

            if (currentSystem === 'elastic') {
                const scrollY = window.scrollY;
                elasticPoints.forEach((point, index) => {
                    point.targetY = (point.y + scrollY * 0.1);
                });
            }
        }
    }
});

const words = ["intelligent", "elegant", "innovative"];
let i = 0;
let j = 0;
let currentWord = "";
let isDeleting = false;

function typeWriter() {
    const typewriterElement = document.getElementById("typewriter");
    currentWord = words[i];

    if (isDeleting) {
        typewriterElement.textContent = currentWord.substring(0, j-1);
        j--;
        if (j === 0) {
            isDeleting = false;
            i = (i + 1) % words.length;
        }
    } else {
        typewriterElement.textContent = currentWord.substring(0, j+1);
        j++;
        if (j === currentWord.length) {
            isDeleting = true;
            setTimeout(typeWriter, 1500);
            return;
        }
    }

    const typingSpeed = isDeleting ? 50 : 150;
    setTimeout(typeWriter, typingSpeed);
}

window.onload = typeWriter;

const menuToggle = document.querySelector('.menu-toggle');
const navLinksContainer = document.querySelector('.nav-links');
const socialIcons = document.querySelector('.social-icons');

menuToggle.addEventListener('click', () => {
    navLinksContainer.classList.toggle('show');
    socialIcons.classList.toggle('show');
});

document.getElementById('current-year').textContent = new Date().getFullYear();

const navLinks = document.querySelectorAll('.nav-links li a');

navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        
        // Smooth scroll to the target section
        const targetId = this.getAttribute('href').substring(1);
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth' });
        }
        
        // Close mobile menu if open
        navLinksContainer.classList.remove('show');
        socialIcons.classList.remove('show');
    });
});

// Add scroll event listener to highlight active section in nav
window.addEventListener('scroll', () => {
    let current = '';
    const sections = document.querySelectorAll('section');
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (pageYOffset >= sectionTop - sectionHeight / 3) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').substring(1) === current) {
            link.classList.add('active');
        }
    });
});