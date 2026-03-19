import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      restaurantId: string | null;
      role: string;
    }
  }
}

export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "make-to-create-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) return done(null, false, { message: "Correo o contraseña incorrectos" });
          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return done(null, false, { message: "Correo o contraseña incorrectos" });
          return done(null, {
            id: user.id,
            email: user.email,
            name: user.name,
            restaurantId: user.restaurantId,
            role: user.role,
          });
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      done(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        restaurantId: user.restaurantId,
        role: user.role,
      });
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name, restaurantName, restaurantSlug } = req.body;

      if (!email || !password || !name || !restaurantName || !restaurantSlug) {
        return res.status(400).json({ message: "Todos los campos son requeridos" });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Ya existe una cuenta con ese correo" });
      }

      const existingRestaurant = await storage.getRestaurantBySlug(restaurantSlug);
      if (existingRestaurant) {
        return res.status(400).json({ message: "Ese nombre de URL ya está en uso" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const restaurant = await storage.createRestaurant({
        name: restaurantName,
        slug: restaurantSlug,
        description: null,
        logoUrl: null,
      });

      const user = await storage.createUser({
        email,
        password: hashedPassword,
        name,
        restaurantId: restaurant.id,
        role: "owner",
      });

      req.login(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          restaurantId: user.restaurantId,
          role: user.role,
        },
        (err) => {
          if (err) return res.status(500).json({ message: "Error al iniciar sesión" });
          return res.status(201).json({
            id: user.id,
            email: user.email,
            name: user.name,
            restaurantId: user.restaurantId,
            role: user.role,
          });
        }
      );
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Error interno" });
    }
  });

  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Credenciales inválidas" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Error al cerrar sesión" });
      res.json({ message: "Sesión cerrada" });
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "No autenticado" });
    res.json(req.user);
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "No autenticado" });
}
