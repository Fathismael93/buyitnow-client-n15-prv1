import mongoose from 'mongoose';
import slug from 'mongoose-slug-updater';

// Initialiser le plugin de slug
mongoose.plugin(slug);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom du produit est obligatoire'],
      trim: true,
      maxlength: [100, 'Le nom du produit ne peut pas dépasser 100 caractères'],
    },
    slug: {
      type: String,
      slug: 'name',
      unique: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'La description du produit est obligatoire'],
      trim: true,
      maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères'],
    },
    price: {
      type: Number,
      required: [true, 'Le prix du produit est obligatoire'],
      min: [0, 'Le prix ne peut pas être négatif'],
      set: (val) => Math.round(val * 100) / 100, // Arrondir à 2 décimales
      index: true,
    },
    images: [
      {
        public_id: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
      },
    ],
    category: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'La catégorie du produit est obligatoire'],
      ref: 'Category',
      index: true,
    },
    stock: {
      type: Number,
      required: [true, 'Le stock du produit est obligatoire'],
      min: [0, 'Le stock ne peut pas être négatif'],
      validate: {
        validator: Number.isInteger,
        message: 'Le stock doit être un nombre entier',
      },
    },
    sold: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Indexer les champs fréquemment recherchés
productSchema.index({
  name: 'text',
  category: mongoose.Schema.Types.ObjectId,
  isActive: Boolean,
  price: Number,
});

// Middleware pre-save pour mettre à jour le champ updatedAt
productSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Middleware pour vérifier le stock avant de sauvegarder
productSchema.pre('save', function (next) {
  if (this.isModified('stock') && this.stock < 0) {
    this.stock = 0;
  }
  next();
});

// Méthode pour vérifier si un produit est en stock
productSchema.methods.isInStock = function () {
  return this.stock > 0;
};

/* MÉTHODES DE MIGRATION POUR LES DOCUMENTS EXISTANTS */

// Méthode statique pour ajouter les slugs manquants
productSchema.statics.migrateAddSlugs = async function () {
  const products = await this.find({ slug: { $exists: false } });

  console.log(`Migration des slugs pour ${products.length} produits`);

  for (const product of products) {
    // Le slug sera automatiquement généré à partir du nom grâce au plugin
    product.slug = undefined; // Forcer le plugin à générer le slug
    await product.save();
    console.log(
      `Slug généré pour le produit: ${product._id} - ${product.name}`,
    );
  }

  return `${products.length} produits ont été mis à jour avec des slugs`;
};

// Méthode statique pour ajouter le champ isActive
productSchema.statics.migrateAddIsActive = async function () {
  const result = await this.updateMany(
    { isActive: { $exists: false } },
    { $set: { isActive: true } },
  );

  console.log(`Migration du champ isActive terminée`);
  return `${result.modifiedCount} produits ont été mis à jour avec isActive = true`;
};

// Méthode statique pour ajouter le champ sold et ajuster les stocks
productSchema.statics.migrateAddSoldAndUpdateStock = async function () {
  // Obtenir le modèle Order
  const Order = mongoose.model('Order');

  // 1. D'abord, ajouter le champ 'sold' = 0 à tous les produits qui ne l'ont pas
  const soldResult = await this.updateMany(
    { sold: { $exists: false } },
    { $set: { sold: 0 } },
  );

  console.log(
    `${soldResult.modifiedCount} produits ont été initialisés avec sold = 0`,
  );

  // 2. Maintenant, calculer les ventes réelles basées sur les commandes payées
  const products = await this.find({});

  for (const product of products) {
    // Trouver toutes les commandes payées contenant ce produit
    const orders = await Order.find({
      'orderItems.product': product._id,
      paymentStatus: 'paid',
    });

    let totalSold = 0;

    // Calculer combien d'unités ont été vendues
    for (const order of orders) {
      for (const item of order.orderItems) {
        if (item.product.toString() === product._id.toString()) {
          totalSold += item.quantity;
        }
      }
    }

    if (totalSold > 0) {
      product.sold = totalSold;
      await product.save();
      console.log(
        `Mise à jour des ventes pour ${product._id}: ${totalSold} unités vendues`,
      );
    }
  }

  return `Migration des ventes terminée pour ${products.length} produits`;
};

// Méthode statique pour ajouter le champ updatedAt
productSchema.statics.migrateAddUpdatedAt = async function () {
  const result = await this.updateMany(
    { updatedAt: { $exists: false } },
    { $set: { updatedAt: Date.now() } },
  );

  console.log(`Migration du champ updatedAt terminée`);
  return `${result.modifiedCount} produits ont été mis à jour avec updatedAt = maintenant`;
};

// Méthode principale pour exécuter toutes les migrations
productSchema.statics.runAllMigrations = async function () {
  console.log('Démarrage de toutes les migrations de produits...');

  const results = {};

  try {
    results.slugs = await this.migrateAddSlugs();
    results.isActive = await this.migrateAddIsActive();
    results.soldAndStock = await this.migrateAddSoldAndUpdateStock();
    results.updatedAt = await this.migrateAddUpdatedAt();

    console.log('Toutes les migrations de produits terminées avec succès');
    return results;
  } catch (error) {
    console.error('Erreur lors des migrations:', error);
    throw error;
  }
};

// Assurer que les modèles ne sont pas redéfinis en cas de hot-reload
const Product =
  mongoose.models.Product || mongoose.model('Product', productSchema);

export default Product;
