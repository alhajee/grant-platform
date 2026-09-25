const contourPath = "M430 60C655 28 797 175 749 373C718 497 709 533 777 669C879 873 720 1030 509 988C322 951 247 1070 115 922C-20 771 92 645 53 461C10 260 190 94 430 60Z";

export function LoginContours() {
  return (
    <svg className="login-contours" viewBox="0 0 800 1050" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true" focusable="false">
      {Array.from({ length: 9 }, (_, index) => {
        const scale = 1.45 - index * 0.14;
        return <path key={index} d={contourPath} transform={`translate(400 525) scale(${scale}) translate(-400 -525)`} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}
