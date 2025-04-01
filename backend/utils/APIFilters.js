import mongoose from 'mongoose';

class APIFilters {
  constructor(query, queryStr) {
    this.query = query;
    this.queryStr = queryStr;
  }

  search() {
    const keyword = this.queryStr.get('keyword')
      ? {
          name: {
            $regex: this.queryStr.get('keyword'),
            $options: 'i',
          },
        }
      : {};

    this.query = this.query.find({ ...keyword });
    return this;
  }

  filter() {
    let queryCopy = {};

    if (this.queryStr.get('category')) {
      queryCopy = {
        category: this.queryStr.get('category'),
        ...queryCopy,
      };
    }

    if (this.queryStr.get('price[gte]')) {
      queryCopy = {
        'price[gte]': this.queryStr.get('price[gte]'),
        ...queryCopy,
      };
    }

    if (this.queryStr.get('price[lte]')) {
      queryCopy = {
        'price[lte]': this.queryStr.get('price[lte]'),
        ...queryCopy,
      };
    }

    const removeFields = ['keyword', 'page'];
    removeFields.forEach((el) => delete queryCopy[el]);

    let output = {};
    let prop = '';

    for (let key in queryCopy) {
      if (!key.match(/\b(gt|gte|lt|lte)/)) {
        if (key === 'category') {
          const categoryId = mongoose.Types.ObjectId.createFromHexString(
            queryCopy[key],
          );

          output[key] = categoryId;
        } else {
          output[key] = queryCopy[key];
        }
      } else {
        prop = key.split('[')[0];

        let operator = key.match(/\[(.*)\]/)[1];

        if (!output[prop]) {
          output[prop] = {};
        }

        output[prop][`$${operator}`] = queryCopy[key];
      }
    }
    // { price: { $gte: 100, $lte: 1000 } }

    this.query = this.query.find(output);
    return this;
  }

  pagination(resPerPage) {
    const currentPage = Number(this.queryStr.get('page')) || 1;
    const skip = resPerPage * (currentPage - 1);

    this.query = this.query.limit(resPerPage).skip(skip);
    return this;
  }
}

export default APIFilters;
