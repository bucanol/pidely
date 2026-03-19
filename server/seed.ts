import { db } from "./db";
import { restaurants, categories, products, tables, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

function log(msg: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [seed] ${msg}`);
}

export async function seedDatabase() {
  const existing = await db.select().from(restaurants).where(eq(restaurants.slug, "elcielo"));
  if (existing.length > 0) {
    log("Database already seeded, skipping.");
    return;
  }

  log("Seeding database with demo restaurant...");

  const [restaurant] = await db.insert(restaurants).values({
    name: "El Cielo",
    slug: "elcielo",
    description: "Cocina de autor con ingredientes de temporada. Una experiencia gastronómica que celebra los sabores auténticos de la región.",
    logoUrl: null,
  }).returning();

  const [catEntradas, catPrincipales, catPostres, catBebidas] = await db.insert(categories).values([
    { restaurantId: restaurant.id, name: "Entradas", displayOrder: 0 },
    { restaurantId: restaurant.id, name: "Principales", displayOrder: 1 },
    { restaurantId: restaurant.id, name: "Postres", displayOrder: 2 },
    { restaurantId: restaurant.id, name: "Bebidas", displayOrder: 3 },
  ]).returning();

  await db.insert(products).values([
    {
      restaurantId: restaurant.id,
      categoryId: catEntradas.id,
      name: "Tartare de Atún",
      description: "Atún aleta amarilla, aguacate, gel de ponzu, semillas de ajonjolí negro y microgreens. Servido con crujiente de taro.",
      price: "195.00",
      imageUrl: "/images/tuna-tartare.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catEntradas.id,
      name: "Velouté de Hongos",
      description: "Crema aterciopelada de hongos silvestres, morillas salteadas, aceite de cebollín y trufa rallada.",
      price: "165.00",
      imageUrl: "/images/mushroom-veloute.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catEntradas.id,
      name: "Vieiras Selladas",
      description: "Trío de vieiras sobre crema de coliflor, alcaparras fritas y espuma de azafrán. Un clásico reinventado.",
      price: "245.00",
      imageUrl: "/images/scallops.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catPrincipales.id,
      name: "Lomo de Wagyu",
      description: "Medallón de res wagyu al punto, jus de trufa negra, puré de papa trufado y puntas de espárragos verdes.",
      price: "680.00",
      imageUrl: "/images/wagyu-tenderloin.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catPrincipales.id,
      name: "Pechuga de Pato",
      description: "Pato magret sellado, reducción de cereza, puré de chirivía y piel crujiente. Acompañado de mizuna.",
      price: "395.00",
      imageUrl: "/images/duck-breast.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catPrincipales.id,
      name: "Lubina al Horno",
      description: "Filete de lubina sobre confit de hinojo, beurre blanc de limón, gotas de aceite de eneldo y berros.",
      price: "355.00",
      imageUrl: "/images/sea-bass.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catPrincipales.id,
      name: "Risotto de Trufa",
      description: "Risotto carnaroli en mantequilla, trufa negra rallada en mesa, espuma de parmesano y aceite de perejil.",
      price: "295.00",
      imageUrl: "/images/truffle-risotto.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catPostres.id,
      name: "Esfera de Chocolate",
      description: "Esfera de chocolate oscuro con hoja de oro, derretida en mesa con coulis de frambuesa y polvo de cacao.",
      price: "185.00",
      imageUrl: "/images/chocolate-sphere.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catPostres.id,
      name: "Tarta de Limón Deconstructa",
      description: "Cremoso de limón amarillo, merengue italiano soasado, ralladura confitada y flores comestibles.",
      price: "155.00",
      imageUrl: "/images/lemon-tart.png",
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catBebidas.id,
      name: "Agua Mineral",
      description: "500ml. Sin gas o con gas.",
      price: "45.00",
      imageUrl: null,
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catBebidas.id,
      name: "Limonada de Hierbabuena",
      description: "Limonada fresca con hierbabuena, agua mineral y jarabe de agave.",
      price: "95.00",
      imageUrl: null,
      isAvailable: true,
    },
    {
      restaurantId: restaurant.id,
      categoryId: catBebidas.id,
      name: "Café de Especialidad",
      description: "Espresso de origen único, preparación V60 o prensa francesa. Leche de avena disponible.",
      price: "85.00",
      imageUrl: null,
      isAvailable: true,
    },
  ]);

  const tableValues = [];
  for (let i = 1; i <= 10; i++) {
    tableValues.push({ restaurantId: restaurant.id, number: i, label: null });
  }
  await db.insert(tables).values(tableValues);

  const hashedPassword = await bcrypt.hash("demo1234", 10);
  await db.insert(users).values({
    email: "demo@elcielo.com",
    password: hashedPassword,
    name: "Chef El Cielo",
    restaurantId: restaurant.id,
    role: "owner",
  });

  log("Database seeded successfully! Demo login: demo@elcielo.com / demo1234");
}
