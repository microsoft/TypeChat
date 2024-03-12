// Entry point is: 'FirstOrSecond'

type FirstOrSecond<T> = First<T> | Second<T>

interface Second<T> {
    kind: "second";
    "second_attr": T;
}

interface First<T> {
    kind: "first";
    "first_attr": T;
}
