//! $1 Unistroke Recognizer (Wobbrock, Wilson & Li, 2007) — small, fast,
//! rotation/scale/translation invariant. Perfect for "draw a rune → cast a spell".

use std::f64::consts::PI;

pub type Point = (f64, f64);

const N: usize = 64;
const SQUARE_SIZE: f64 = 250.0;
const ANGLE_RANGE: f64 = 45.0 * PI / 180.0;
const ANGLE_PRECISION: f64 = 2.0 * PI / 180.0;
const PHI: f64 = 0.618_033_988_749_895; // golden ratio

#[derive(Debug, Clone)]
pub struct Template {
    pub id: String,
    pub points: Vec<Point>,
}

impl Template {
    pub fn new(id: String, raw: &[Point]) -> Option<Self> {
        let points = normalize(raw)?;
        Some(Template { id, points })
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Match {
    pub id: String,
    pub score: f64,
}

/// Normalize a raw stroke into the canonical $1 form.
pub fn normalize(raw: &[Point]) -> Option<Vec<Point>> {
    if raw.len() < 2 || path_length(raw) < 1e-6 {
        return None;
    }
    let mut pts = resample(raw, N);
    let radians = indicative_angle(&pts);
    pts = rotate_by(&pts, -radians);
    pts = scale_to(&pts, SQUARE_SIZE);
    pts = translate_to(&pts, (0.0, 0.0));
    Some(pts)
}

/// Returns the best match with a score in [0, 1] (1 = perfect).
pub fn recognize(raw: &[Point], templates: &[Template]) -> Option<Match> {
    let candidate = normalize(raw)?;
    let half_diag = 0.5 * (2.0 * SQUARE_SIZE * SQUARE_SIZE).sqrt();
    let mut best: Option<Match> = None;
    for t in templates {
        let d = distance_at_best_angle(&candidate, &t.points, -ANGLE_RANGE, ANGLE_RANGE, ANGLE_PRECISION);
        let score = 1.0 - d / half_diag;
        if best.as_ref().map_or(true, |b| score > b.score) {
            best = Some(Match { id: t.id.clone(), score });
        }
    }
    best
}

fn resample(points: &[Point], n: usize) -> Vec<Point> {
    let interval = path_length(points) / (n as f64 - 1.0);
    let mut d_acc = 0.0;
    let mut out = vec![points[0]];
    let mut pts: Vec<Point> = points.to_vec();
    let mut i = 1;
    while i < pts.len() {
        let (px, py) = pts[i - 1];
        let (cx, cy) = pts[i];
        let d = dist((px, py), (cx, cy));
        if d_acc + d >= interval && d > 0.0 {
            let qx = px + ((interval - d_acc) / d) * (cx - px);
            let qy = py + ((interval - d_acc) / d) * (cy - py);
            out.push((qx, qy));
            pts.insert(i, (qx, qy));
            d_acc = 0.0;
        } else {
            d_acc += d;
        }
        i += 1;
    }
    while out.len() < n {
        out.push(*points.last().unwrap());
    }
    out.truncate(n);
    out
}

fn indicative_angle(points: &[Point]) -> f64 {
    let c = centroid(points);
    (c.1 - points[0].1).atan2(c.0 - points[0].0)
}

fn rotate_by(points: &[Point], radians: f64) -> Vec<Point> {
    let c = centroid(points);
    let (s, co) = radians.sin_cos();
    points
        .iter()
        .map(|&(x, y)| {
            let qx = (x - c.0) * co - (y - c.1) * s + c.0;
            let qy = (x - c.0) * s + (y - c.1) * co + c.1;
            (qx, qy)
        })
        .collect()
}

fn scale_to(points: &[Point], size: f64) -> Vec<Point> {
    let (min_x, min_y, max_x, max_y) = bbox(points);
    let w = (max_x - min_x).max(1e-9);
    let h = (max_y - min_y).max(1e-9);
    points.iter().map(|&(x, y)| (x * size / w, y * size / h)).collect()
}

fn translate_to(points: &[Point], k: Point) -> Vec<Point> {
    let c = centroid(points);
    points.iter().map(|&(x, y)| (x + k.0 - c.0, y + k.1 - c.1)).collect()
}

fn distance_at_best_angle(points: &[Point], t: &[Point], mut a: f64, mut b: f64, threshold: f64) -> f64 {
    let mut x1 = PHI * a + (1.0 - PHI) * b;
    let mut f1 = distance_at_angle(points, t, x1);
    let mut x2 = (1.0 - PHI) * a + PHI * b;
    let mut f2 = distance_at_angle(points, t, x2);
    while (b - a).abs() > threshold {
        if f1 < f2 {
            b = x2;
            x2 = x1;
            f2 = f1;
            x1 = PHI * a + (1.0 - PHI) * b;
            f1 = distance_at_angle(points, t, x1);
        } else {
            a = x1;
            x1 = x2;
            f1 = f2;
            x2 = (1.0 - PHI) * a + PHI * b;
            f2 = distance_at_angle(points, t, x2);
        }
    }
    f1.min(f2)
}

fn distance_at_angle(points: &[Point], t: &[Point], radians: f64) -> f64 {
    let rotated = rotate_by(points, radians);
    path_distance(&rotated, t)
}

fn path_distance(a: &[Point], b: &[Point]) -> f64 {
    let n = a.len().min(b.len());
    let mut d = 0.0;
    for i in 0..n {
        d += dist(a[i], b[i]);
    }
    d / n as f64
}

fn centroid(points: &[Point]) -> Point {
    let n = points.len() as f64;
    let (sx, sy) = points.iter().fold((0.0, 0.0), |(ax, ay), &(x, y)| (ax + x, ay + y));
    (sx / n, sy / n)
}

fn bbox(points: &[Point]) -> (f64, f64, f64, f64) {
    points.iter().fold(
        (f64::MAX, f64::MAX, f64::MIN, f64::MIN),
        |(a, b, c, d), &(x, y)| (a.min(x), b.min(y), c.max(x), d.max(y)),
    )
}

fn path_length(points: &[Point]) -> f64 {
    points.windows(2).map(|w| dist(w[0], w[1])).sum()
}

fn dist(a: Point, b: Point) -> f64 {
    ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt()
}

/// Built-in example strokes so the spellbook isn't empty on first launch.
pub mod shapes {
    use super::Point;
    use std::f64::consts::PI;

    pub fn circle() -> Vec<Point> {
        (0..=48)
            .map(|i| {
                let a = -PI / 2.0 + i as f64 / 48.0 * 2.0 * PI;
                (100.0 + 60.0 * a.cos(), 100.0 + 60.0 * a.sin())
            })
            .collect()
    }
    pub fn check() -> Vec<Point> {
        polyline(&[(20.0, 90.0), (60.0, 140.0), (150.0, 30.0)])
    }
    pub fn zigzag() -> Vec<Point> {
        polyline(&[(20.0, 20.0), (140.0, 20.0), (20.0, 140.0), (140.0, 140.0)])
    }
    pub fn polyline(corners: &[Point]) -> Vec<Point> {
        let mut out = vec![];
        for w in corners.windows(2) {
            for i in 0..12 {
                let t = i as f64 / 12.0;
                out.push((w[0].0 + (w[1].0 - w[0].0) * t, w[0].1 + (w[1].1 - w[0].1) * t));
            }
        }
        out.push(*corners.last().unwrap());
        out
    }
}
