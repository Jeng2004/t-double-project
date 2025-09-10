import mongoose, { Schema, model, models } from "mongoose";

const productSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    category: { type: String },
    price: {
      S: { type: Number },
      M: { type: Number },
      L: { type: Number },
      XL: { type: Number },
    },
    stock: {
      S: { type: Number, default: 0 },
      M: { type: Number, default: 0 },
      L: { type: Number, default: 0 },
      XL: { type: Number, default: 0 },
    },
    imageUrls: [{ type: String }],
  },
  { timestamps: true }
);

const Product = models.Product || model("Product", productSchema);

export default Product;
