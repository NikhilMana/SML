"""Synthetic eCommerce dataset seeder for the controlled natural-language CRUD assistant."""

import datetime
from sqlalchemy.orm import Session
from app.db.models import DemoCustomer, DemoProduct, DemoOrder
from app.db.session import demo_engine, DemoBase


SAMPLE_CUSTOMERS = [
    {"name": "Rahul Sharma", "email": "rahul.sharma@example.test", "city": "Bengaluru", "status": "active"},
    {"name": "Priya Patel", "email": "priya.patel@example.test", "city": "Mumbai", "status": "vip"},
    {"name": "Arjun Rao", "email": "arjun.rao@example.test", "city": "Mysuru", "status": "active"},
    {"name": "Ananya Iyer", "email": "ananya.iyer@example.test", "city": "Bengaluru", "status": "active"},
    {"name": "Vikram Singh", "email": "vikram.singh@example.test", "city": "Delhi", "status": "inactive"},
    {"name": "Sneha Reddy", "email": "sneha.reddy@example.test", "city": "Hyderabad", "status": "vip"},
    {"name": "Kavita Nair", "email": "kavita.nair@example.test", "city": "Bengaluru", "status": "active"},
    {"name": "Rohan Gupta", "email": "rohan.gupta@example.test", "city": "Pune", "status": "active"},
    {"name": "Deepa Joshi", "email": "deepa.joshi@example.test", "city": "Bengaluru", "status": "inactive"},
    {"name": "Manish Verma", "email": "manish.verma@example.test", "city": "Chennai", "status": "active"},
]

SAMPLE_PRODUCTS = [
    {"name": "Quantum Pro Mechanical Keyboard", "category": "Peripherals", "price": 149.99, "stock": 45, "is_active": True},
    {"name": "AeroView 34-inch Curved UltraWide Monitor", "category": "Displays", "price": 599.99, "stock": 18, "is_active": True},
    {"name": "Nexus Wireless Noise-Cancelling Headphones", "category": "Audio", "price": 249.99, "stock": 60, "is_active": True},
    {"name": "Precision Ergonomic Mouse", "category": "Peripherals", "price": 79.99, "stock": 120, "is_active": True},
    {"name": "Titanium Workstation Laptop 16GB", "category": "Computers", "price": 1499.99, "stock": 12, "is_active": True},
    {"name": "PulseFit Active Smartwatch", "category": "Wearables", "price": 189.99, "stock": 35, "is_active": True},
    {"name": "HyperDrive 2TB NVMe SSD", "category": "Storage", "price": 179.99, "stock": 85, "is_active": True},
    {"name": "ClearTone Studio Condenser Microphone", "category": "Audio", "price": 129.99, "stock": 40, "is_active": True},
]


def seed_demo_database(db: Session, force_reset: bool = True) -> dict:
    """Populate or reset the isolated demo database with synthetic records.
    
    Returns summary of seeded counts.
    """
    if force_reset:
        DemoBase.metadata.drop_all(bind=demo_engine)
        DemoBase.metadata.create_all(bind=demo_engine)

    # Check if records already exist
    existing_customers = db.query(DemoCustomer).count()
    if existing_customers > 0 and not force_reset:
        return {"message": "Demo database already seeded", "customers": existing_customers}

    # Add customers
    customer_objs = []
    for c_data in SAMPLE_CUSTOMERS:
        c = DemoCustomer(**c_data)
        db.add(c)
        customer_objs.append(c)
    db.flush()

    # Add products
    product_objs = []
    for p_data in SAMPLE_PRODUCTS:
        p = DemoProduct(**p_data)
        db.add(p)
        product_objs.append(p)
    db.flush()

    # Add realistic orders spanning the last 45 days
    now = datetime.datetime.now(datetime.timezone.utc)
    sample_orders = [
        {"customer_id": customer_objs[0].id, "product_id": product_objs[0].id, "quantity": 1, "total_amount": 149.99, "status": "completed", "order_date": now - datetime.timedelta(days=5)},
        {"customer_id": customer_objs[1].id, "product_id": product_objs[4].id, "quantity": 1, "total_amount": 1499.99, "status": "completed", "order_date": now - datetime.timedelta(days=12)},
        {"customer_id": customer_objs[2].id, "product_id": product_objs[2].id, "quantity": 2, "total_amount": 499.98, "status": "completed", "order_date": now - datetime.timedelta(days=18)},
        {"customer_id": customer_objs[0].id, "product_id": product_objs[3].id, "quantity": 1, "total_amount": 79.99, "status": "completed", "order_date": now - datetime.timedelta(days=22)},
        {"customer_id": customer_objs[3].id, "product_id": product_objs[1].id, "quantity": 1, "total_amount": 599.99, "status": "completed", "order_date": now - datetime.timedelta(days=28)},
        {"customer_id": customer_objs[5].id, "product_id": product_objs[5].id, "quantity": 1, "total_amount": 189.99, "status": "pending", "order_date": now - datetime.timedelta(days=2)},
        {"customer_id": customer_objs[7].id, "product_id": product_objs[6].id, "quantity": 2, "total_amount": 359.98, "status": "completed", "order_date": now - datetime.timedelta(days=40)},
    ]

    for o_data in sample_orders:
        o = DemoOrder(**o_data)
        db.add(o)

    db.commit()

    return {
        "customers": len(customer_objs),
        "products": len(product_objs),
        "orders": len(sample_orders),
        "status": "success",
    }
