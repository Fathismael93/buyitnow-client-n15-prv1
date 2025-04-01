import mongoose from 'mongoose';

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

export default mongoose.models.Order || mongoose.model('Order', orderSchema);
