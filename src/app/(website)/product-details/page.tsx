'use client';

import styles from './product-details.module.css';
import Image from 'next/image';
import Navbar from '../components/Navbar';
import Product from '../components/product';

export default function ProductDetailsPage() {
  return (
    <>
        <Navbar />
        <div className={styles.container}>
            <div className={styles.main}>
                {/* ภาพสินค้า */}
                <div className={styles.imageColumn}>
                <Image src="/JOKER-TEE.png" alt="product" width={500} height={500} />
                <Image src="/JOKER-TEE.png" alt="product back" width={500} height={500} />
                </div>

                {/* รายละเอียดสินค้า */}
                <div className={styles.detailColumn}>
                <h2 className={styles.title}>JOKER TEE</h2>
                <p className={styles.price}>฿550</p>

                <div className={styles.sizeSection}>
                    <p>ขนาด</p>
                    <div className={styles.options}>
                        <span>S</span>
                        <span>M</span>
                        <span>L</span>
                        <span>XL</span>
                    </div>

                </div>

                <div className={styles.colorSection}>
                    <p>สี</p>
                    <div className={styles.colorList}>
                    <Image src="/products/black.jpg" alt="black" width={60} height={60} />
                    <Image src="/products/white.jpg" alt="white" width={60} height={60} />
                    <Image src="/products/navy.jpg" alt="navy" width={60} height={60} />
                    </div>
                </div>

                <div className={styles.sizeTable}>
                    <p>รายละเอียดขนาด (นิ้ว)</p>
                    <table>
                    <thead>
                        <tr>
                        <th>SIZE</th>
                        <th>S</th>
                        <th>M</th>
                        <th>L</th>
                        <th>XL</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                        <td>รอบอก</td>
                        <td>20</td>
                        <td>22</td>
                        <td>24</td>
                        <td>26</td>
                        </tr>
                        <tr>
                        <td>ความยาว</td>
                        <td>25</td>
                        <td>27</td>
                        <td>29</td>
                        <td>30</td>
                        </tr>
                    </tbody>
                    </table>
                </div>

                <Image src="/size-guide.png" alt="size guide" width={300} height={200} />

                <div className={styles.actions}>
                    <button className={styles.primary}>ซื้อเลย</button>
                    <button className={styles.secondary}>เพิ่มลงในตะกร้า</button>
                </div>
                </div>
            </div>

            {/* สินค้าที่คล้ายกัน */}
            <div className={styles.relatedSection}>
                <h3>สินค้าที่คล้ายกัน</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                <Product
                    name="ASTRONAUT TEE"
                    price={1200}
                    imageUrl="/JOKER-TEE.png"
                    isOutOfStock={true}
                />
                <Product
                    name="JOKER TEE"
                    price={1500}
                    imageUrl="/JOKER-TEE.png"
                />
                <Product
                    name="ASTRONAUT TEE"
                    price={1200}
                    imageUrl="/JOKER-TEE.png"
                    isOutOfStock={true}
                />
                <Product
                    name="ASTRONAUT TEE"
                    price={1200}
                    imageUrl="/JOKER-TEE.png"
                    isOutOfStock={true}
                />
                </div>
            </div>
        </div>
    </>

  );
}
