import mongoose from 'mongoose';
import slug from 'mongoose-slug-updater';

// Initialiser le plugin de slug
mongoose.plugin(slug);

const categorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: [true, 'Le nom de la catégorie est obligatoire'],
      trim: true,
      maxlength: [
        50,
        'Le nom de la catégorie ne peut pas dépasser 50 caractères',
      ],
      unique: true,
      index: true,
    },
    slug: {
      type: String,
      slug: 'categoryName',
      unique: true,
      index: true,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Index pour la recherche textuelle
categorySchema.index({ categoryName: 'text' });

// Virtual pour récupérer les produits dans cette catégorie
categorySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
});

// Middleware pre-save pour mettre à jour le champ updatedAt
categorySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

/* MÉTHODES DE MIGRATION POUR LES DOCUMENTS EXISTANTS */

// Méthode statique pour ajouter les slugs manquants
categorySchema.statics.migrateAddSlugs = async function () {
  const categories = await this.find({ slug: { $exists: false } });

  console.log(`Migration des slugs pour ${categories.length} catégories`);

  for (const category of categories) {
    // Le slug sera automatiquement généré à partir du nom grâce au plugin
    category.slug = undefined; // Forcer le plugin à générer le slug
    await category.save();
    console.log(
      `Slug généré pour la catégorie: ${category._id} - ${category.categoryName}`,
    );
  }

  return `${categories.length} catégories ont été mises à jour avec des slugs`;
};

// Méthode statique pour ajouter le champ isActive
categorySchema.statics.migrateAddIsActive = async function () {
  const result = await this.updateMany(
    { isActive: { $exists: false } },
    { $set: { isActive: true } },
  );

  console.log(`Migration du champ isActive terminée`);
  return `${result.modifiedCount} catégories ont été mises à jour avec isActive = true`;
};

// Méthode statique pour ajouter le champ sold
categorySchema.statics.migrateAddSold = async function () {
  // Importer et enregistrer explicitement les modèles nécessaires
  let Order;
  let Product;

  try {
    // Essayer d'obtenir les modèles s'ils sont déjà enregistrés
    Order = mongoose.model('Order');
    Product = mongoose.model('Product');
  } catch (error) {
    // Si les modèles ne sont pas enregistrés, les enregistrer manuellement
    const orderSchema = mongoose.Schema({
      shippingInfo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address',
      },
      user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
      },
      orderItems: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Product',
          },
          name: {
            type: String,
            required: true,
          },
          category: {
            type: String,
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
          },
          image: {
            type: String,
            required: true,
          },
          price: {
            type: Number,
            required: true,
          },
        },
      ],
      paymentInfo: {
        amountPaid: {
          type: Number,
          required: true,
        },
        typePayment: {
          type: String,
          required: true,
        },
        paymentAccountNumber: {
          type: String,
          required: true,
        },
        paymentAccountName: {
          type: String,
          required: true,
        },
      },
      paymentStatus: {
        type: String,
        default: 'unpaid',
      },
      orderStatus: {
        type: String,
        default: 'Processing',
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    });

    const productSchema = new mongoose.Schema({
      name: {
        type: String,
        required: true,
      },
      category: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Category',
      },
      // Autres champs minimaux nécessaires
    });

    Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
    Product =
      mongoose.models.Product || mongoose.model('Product', productSchema);
  }

  // 1. D'abord, ajouter le champ 'sold' = 0 à toutes les catégories qui ne l'ont pas
  const soldResult = await this.updateMany(
    { sold: { $exists: false } },
    { $set: { sold: 0 } },
  );

  console.log(
    `${soldResult.modifiedCount} catégories ont été initialisées avec sold = 0`,
  );

  // 2. Maintenant, calculer les ventes réelles basées sur les commandes payées
  const categories = await this.find({});

  for (const category of categories) {
    // Trouver tous les produits de cette catégorie
    const products = await Product.find({ category: category._id });
    const productIds = products.map((product) => product._id);

    // Vérifier si nous avons des produits dans cette catégorie
    if (productIds.length === 0) {
      console.log(
        `Aucun produit trouvé pour la catégorie: ${category.categoryName}`,
      );
      continue;
    }

    // Trouver toutes les commandes payées contenant des produits de cette catégorie
    const orders = await Order.find({
      'orderItems.product': { $in: productIds },
      paymentStatus: 'paid',
    });

    let totalSold = 0;

    // Calculer combien d'unités ont été vendues dans cette catégorie
    for (const order of orders) {
      for (const item of order.orderItems) {
        if (productIds.includes(item.product.toString())) {
          totalSold += item.quantity;
        }
      }
    }

    if (totalSold > 0) {
      category.sold = totalSold;
      await category.save();
      console.log(
        `Mise à jour des ventes pour la catégorie ${category.categoryName}: ${totalSold} unités vendues`,
      );
    }
  }

  return `Migration des ventes terminée pour ${categories.length} catégories`;
};

// Méthode statique pour ajouter le champ updatedAt
categorySchema.statics.migrateAddUpdatedAt = async function () {
  const result = await this.updateMany(
    { updatedAt: { $exists: false } },
    { $set: { updatedAt: Date.now() } },
  );

  console.log(`Migration du champ updatedAt terminée`);
  return `${result.modifiedCount} catégories ont été mises à jour avec updatedAt = maintenant`;
};

// Méthode pour ajouter le champ createdAt s'il manque
categorySchema.statics.migrateAddCreatedAt = async function () {
  const result = await this.updateMany(
    { createdAt: { $exists: false } },
    { $set: { createdAt: Date.now() } },
  );

  console.log(`Migration du champ createdAt terminée`);
  return `${result.modifiedCount} catégories ont été mises à jour avec createdAt = maintenant`;
};

// Méthode principale pour exécuter toutes les migrations
categorySchema.statics.runAllMigrations = async function () {
  console.log('Démarrage de toutes les migrations de catégories...');

  const results = {};

  try {
    results.slugs = await this.migrateAddSlugs();
    results.isActive = await this.migrateAddIsActive();
    results.sold = await this.migrateAddSold();
    results.updatedAt = await this.migrateAddUpdatedAt();
    results.createdAt = await this.migrateAddCreatedAt(); // Au cas où createdAt manquerait aussi

    console.log('Toutes les migrations de catégories terminées avec succès');
    return results;
  } catch (error) {
    console.error('Erreur lors des migrations de catégories:', error);
    throw error;
  }
};

// Assurer que les modèles ne sont pas redéfinis en cas de hot-reload
const Category =
  mongoose.models.Category || mongoose.model('Category', categorySchema);

export default Category;
